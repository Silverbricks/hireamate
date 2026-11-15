"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ageOn, clearPending2fa, createSession, currentSessionId, destroySession, hashPassword, issueOtp, normaliseAuMobile, passwordProblem,
  readPending2fa, sessionUser, setPending2fa, verifyOtp, verifyPassword,
} from "@/server/auth";
import { sendOtp, notify } from "@/server/comms/notify";
import { getSettings } from "@/server/settings";
import { rateLimit } from "@/server/ratelimit";
import { audit } from "@/server/audit";
import { devFeaturesEnabled } from "@/server/env";
import type { FormState } from "./actions";

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

function homeFor(user: { role: string; mateProfile?: { status: string } | null }) {
  if (user.role === "ADMIN") return "/admin";
  if (user.role === "MATE") return user.mateProfile?.status === "APPROVED" ? "/mate" : "/mate/profile";
  return "/";
}

// ---------- Registration (SRS 7.1 / 8.1, v1.2 s15) ----------

const RegisterInput = z.object({
  role: z.enum(["CUSTOMER", "MATE"]),
  displayName: z.string().trim().min(2, "Display name is too short").max(40),
  legalName: z.string().trim().min(2, "Enter your legal name").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  mobile: z.string().trim().min(8, "Enter your Australian mobile"),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth"),
  password: z.string(),
  terms: z.literal("on", { errorMap: () => ({ message: "Please accept the terms and privacy policy" }) }),
});

export async function register(_prev: FormState, fd: FormData): Promise<FormState> {
  const ip = await clientIp();
  if (!rateLimit(`register:${ip}`, 5, 60 * 60_000).ok) return { error: "Too many sign-ups from this network. Try again later." };

  const parsed = RegisterInput.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;
  const { security, booking } = await getSettings();

  const mobile = normaliseAuMobile(input.mobile);
  if (!mobile) return { error: "Enter a valid Australian mobile number (04xx xxx xxx)." };
  const dob = new Date(`${input.dob}T00:00:00Z`);
  const age = ageOn(dob);
  if (Number.isNaN(age) || age > 120) return { error: "Enter a valid date of birth." };
  if (age < booking.minAge) return { error: `You must be ${booking.minAge} or older to use HIRE A MATE.` };
  const pwProblem = passwordProblem(input.password, security.minPasswordLength);
  if (pwProblem) return { error: pwProblem };

  const taken = await db.user.findFirst({ where: { OR: [{ email: input.email }, { mobile }] } });
  if (taken) return { error: "An account already exists with that email or mobile. Try signing in." };

  const user = await db.user.create({
    data: {
      role: input.role, displayName: input.displayName, legalName: input.legalName, email: input.email, mobile,
      dateOfBirth: dob, passwordHash: await hashPassword(input.password), termsAcceptedAt: new Date(),
      ...(input.role === "MATE"
        ? {
            mateProfile: {
              create: {
                displayName: input.displayName, intro: "", about: "", serviceSuburb: "", state: "", hourlyRateCents: 4000,
                languages: ["English"], interests: [], qualities: [], boundaries: "", status: "DRAFT",
              },
            },
          }
        : {}),
    },
  });
  await audit(user.id, "auth.register", "User", user.id, { role: input.role });

  const [ec, mc] = await Promise.all([issueOtp(user.email, "VERIFY_EMAIL"), issueOtp(mobile, "VERIFY_MOBILE")]);
  await Promise.all([sendOtp("EMAIL", user.email, ec, user.id), sendOtp("SMS", mobile, mc, user.id)]);
  await createSession(user.id);
  redirect("/verify");
}

// ---------- Contact + age verification ----------

export async function verifyContact(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await sessionUser();
  if (!user) redirect("/signin");
  const channel = fd.get("channel") === "SMS" ? "SMS" : "EMAIL";
  const code = String(fd.get("code") ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { error: "Enter the 6-digit code." };
  if (!rateLimit(`verify:${user.id}`, 10, 10 * 60_000).ok) return { error: "Too many attempts. Wait a few minutes." };

  const target = channel === "EMAIL" ? user.email : user.mobile;
  if (!target || !(await verifyOtp(target, channel === "EMAIL" ? "VERIFY_EMAIL" : "VERIFY_MOBILE", code))) {
    return { error: "That code is incorrect or has expired. Request a new one." };
  }
  const updated = await db.user.update({
    where: { id: user.id },
    data: channel === "EMAIL" ? { emailVerifiedAt: new Date() } : { mobileVerifiedAt: new Date() },
    include: { mateProfile: true },
  });
  await audit(user.id, `auth.verify_${channel.toLowerCase()}`, "User", user.id);

  if (updated.emailVerifiedAt && updated.mobileVerifiedAt && !updated.ageVerifiedAt) {
    const { booking } = await getSettings();
    if (ageOn(updated.dateOfBirth) >= booking.minAge) {
      // Placeholder method. Launch requires an ID-based age check; see ROADMAP.md.
      await db.user.update({ where: { id: user.id }, data: { ageVerifiedAt: new Date(), ageVerificationMethod: "SELF_DECLARED_DOB" } });
      await notify(user.id, "WELCOME");
      redirect(homeFor(updated));
    }
  }
  revalidatePath("/verify");
  return { ok: `${channel === "EMAIL" ? "Email" : "Mobile"} verified.` };
}

export async function resendCode(channel: "EMAIL" | "SMS") {
  const user = await sessionUser();
  if (!user) redirect("/signin");
  if (!rateLimit(`resend:${user.id}:${channel}`, 3, 10 * 60_000).ok) return;
  if (channel === "EMAIL" && !user.emailVerifiedAt) await sendOtp("EMAIL", user.email, await issueOtp(user.email, "VERIFY_EMAIL"), user.id);
  if (channel === "SMS" && user.mobile && !user.mobileVerifiedAt) await sendOtp("SMS", user.mobile, await issueOtp(user.mobile, "VERIFY_MOBILE"), user.id);
}

// ---------- Sign in / out ----------

async function findByIdentifier(identifier: string) {
  const id = identifier.trim().toLowerCase();
  const mobile = normaliseAuMobile(id);
  return db.user.findFirst({ where: mobile ? { mobile } : { email: id }, include: { mateProfile: true } });
}

const GENERIC = "Incorrect email/mobile or password.";

export async function signIn(_prev: FormState, fd: FormData): Promise<FormState> {
  const identifier = String(fd.get("identifier") ?? "");
  const password = String(fd.get("password") ?? "");
  const ip = await clientIp();
  if (!rateLimit(`signin:${ip}`, 20, 10 * 60_000).ok) return { error: "Too many attempts. Try again in a few minutes." };

  const { security } = await getSettings();
  const user = await findByIdentifier(identifier);
  if (!user || user.status !== "ACTIVE") return { error: GENERIC };
  if (user.lockedUntil && user.lockedUntil > new Date()) return { error: "Account temporarily locked after failed attempts. Try later or sign in with a code." };

  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    const lock = failed >= security.maxFailedLogins;
    await db.user.update({
      where: { id: user.id },
      data: { failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + security.lockMinutes * 60_000) : undefined },
    });
    await audit(user.id, lock ? "auth.locked" : "auth.signin_failed", "User", user.id, { ip });
    return { error: GENERIC };
  }
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });

  // SRS v1.3 s6.3: privileged staff need a second factor (code to their verified mobile, else email).
  if (user.role === "ADMIN") {
    const target = user.mobile ?? user.email;
    await sendOtp(user.mobile ? "SMS" : "EMAIL", target, await issueOtp(target, "STAFF_2FA"), user.id);
    await setPending2fa(user.id);
    await audit(user.id, "auth.staff_2fa_challenge", "User", user.id, { ip });
    redirect("/signin/2fa");
  }
  await createSession(user.id);
  await audit(user.id, "auth.signin", "User", user.id, { ip, method: "password" });
  redirect(homeFor(user));
}

export async function verifyStaff2fa(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = await readPending2fa();
  if (!userId) return { error: "Your sign-in timed out. Start again." };
  const ip = await clientIp();
  if (!rateLimit(`2fa:${userId}`, 5, 10 * 60_000).ok) return { error: "Too many attempts. Start again later." };
  const user = await db.user.findUnique({ where: { id: userId }, include: { mateProfile: true } });
  const code = String(fd.get("code") ?? "").replace(/\D/g, "");
  if (!user || user.status !== "ACTIVE" || !(await verifyOtp(user.mobile ?? user.email, "STAFF_2FA", code))) {
    if (user) await audit(user.id, "auth.staff_2fa_failed", "User", user.id, { ip });
    return { error: "That code is incorrect or has expired." };
  }
  await clearPending2fa();
  await createSession(user.id);
  await audit(user.id, "auth.signin", "User", user.id, { ip, method: "password+otp" });
  redirect(homeFor(user));
}

/** Sends a sign-in or password-reset code. Always answers the same way to avoid revealing accounts. */
export async function requestCode(_prev: FormState, fd: FormData): Promise<FormState> {
  const identifier = String(fd.get("identifier") ?? "");
  const purpose = fd.get("purpose") === "RESET_PASSWORD" ? "RESET_PASSWORD" : "SIGN_IN";
  const ip = await clientIp();
  const okMsg = { ok: "If an account exists for that email or mobile, we've sent a 6-digit code." };
  if (!rateLimit(`code:${ip}`, 10, 10 * 60_000).ok || !rateLimit(`code:${identifier}`, 3, 10 * 60_000).ok) return okMsg;
  const user = await findByIdentifier(identifier);
  if (!user || user.status !== "ACTIVE") return okMsg;
  const viaSms = !!normaliseAuMobile(identifier) && user.mobile;
  const target = viaSms ? user.mobile! : user.email;
  await sendOtp(viaSms ? "SMS" : "EMAIL", target, await issueOtp(target, purpose), user.id);
  return okMsg;
}

export async function signInWithCode(_prev: FormState, fd: FormData): Promise<FormState> {
  const identifier = String(fd.get("identifier") ?? "");
  const code = String(fd.get("code") ?? "").replace(/\D/g, "");
  const newPassword = String(fd.get("newPassword") ?? "");
  const purpose = fd.get("purpose") === "RESET_PASSWORD" ? "RESET_PASSWORD" : "SIGN_IN";
  const ip = await clientIp();
  if (!rateLimit(`codeverify:${ip}`, 20, 10 * 60_000).ok) return { error: "Too many attempts. Try again later." };

  const user = await findByIdentifier(identifier);
  const target = user ? (normaliseAuMobile(identifier) && user.mobile ? user.mobile : user.email) : null;
  if (!user || !target || !(await verifyOtp(target, purpose, code))) return { error: "That code is incorrect or has expired." };

  // Staff can't sign in with a single factor; after a reset they sign in with password + code.
  if (user.role === "ADMIN" && purpose === "SIGN_IN") return { error: "Staff accounts sign in with password and a security code." };

  if (purpose === "RESET_PASSWORD") {
    const { security } = await getSettings();
    const problem = passwordProblem(newPassword, security.minPasswordLength);
    if (problem) return { error: problem };
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword), failedLogins: 0, lockedUntil: null } }),
      db.session.deleteMany({ where: { userId: user.id } }), // sign out everywhere
    ]);
    await notify(user.id, "PASSWORD_CHANGED");
    await audit(user.id, "auth.password_reset", "User", user.id, { ip });
    if (user.role === "ADMIN") redirect("/signin?reset=1");
  } else {
    await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    await audit(user.id, "auth.signin", "User", user.id, { ip, method: "otp" });
  }
  await createSession(user.id);
  redirect(homeFor(user));
}

export async function signOut() {
  const user = await sessionUser();
  await destroySession();
  if (user) await audit(user.id, "auth.signout", "User", user.id);
  redirect("/");
}

// ---------- Device / session management (SRS v1.3 s6.3) ----------

export async function revokeSession(sessionId: string) {
  const user = await sessionUser();
  if (!user) redirect("/signin");
  await db.session.deleteMany({ where: { id: sessionId, userId: user.id } });
  await audit(user.id, "auth.session_revoked", "Session", null);
  revalidatePath("/account");
}

export async function revokeOtherSessions() {
  const user = await sessionUser();
  if (!user) redirect("/signin");
  const current = await currentSessionId();
  const r = await db.session.deleteMany({ where: { userId: user.id, id: { not: current ?? "" } } });
  await audit(user.id, "auth.sessions_revoked", "User", user.id, { count: r.count });
  revalidatePath("/account");
}

/** Development/demo only (SRS v1.3 s27): never available in production. */
export async function demoSignIn(userId: string) {
  if (!devFeaturesEnabled()) return;
  const user = await db.user.findUnique({ where: { id: userId }, include: { mateProfile: true } });
  if (!user) return;
  await createSession(user.id);
  await audit(user.id, "auth.signin", "User", user.id, { method: "demo" });
  redirect(homeFor(user));
}
