import "server-only";
import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { getSettings } from "./settings";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const SESSION_COOKIE = "ham_session";

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set in production");
  return s ?? "dev-only-insecure-secret";
}

// ---------- Passwords (scrypt) ----------

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string | null | undefined) {
  if (!stored) return false;
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scryptAsync(pw, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(expected, actual);
}

// ---------- Sessions ----------

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string) {
  const { security } = await getSettings();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + security.sessionDays * 86400_000);
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  await db.session.create({ data: { id: sha256(token), userId, expiresAt, userAgent: ua } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function sessionUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: sha256(token) },
    include: { user: { include: { mateProfile: true } } },
  });
  if (!session || session.expiresAt < new Date() || session.user.status !== "ACTIVE") return null;
  // Device/session management (s6.3): track activity, at most once every 5 minutes.
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return session.user;
}

/** Hash of the current session cookie, to mark "this device" in the sessions list. */
export async function currentSessionId() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : null;
}

// ---------- Staff two-step sign-in (SRS v1.3 s6.3) ----------
// After a correct password, staff hold a short-lived signed "pending" cookie until they enter the code.

const PENDING_COOKIE = "ham_2fa";
const sign = (v: string) => createHmac("sha256", secret()).update(`2fa|${v}`).digest("base64url");

export async function setPending2fa(userId: string) {
  const exp = Date.now() + 10 * 60_000;
  const value = `${userId}.${exp}`;
  (await cookies()).set(PENDING_COOKIE, `${value}.${sign(value)}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.HAM_ENV !== "local", path: "/", maxAge: 600,
  });
}

export async function readPending2fa(): Promise<string | null> {
  const raw = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!raw) return null;
  const [userId, exp, sig] = raw.split(".");
  if (!userId || !exp || !sig) return null;
  const expected = sign(`${userId}.${exp}`);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return Number(exp) > Date.now() ? userId : null;
}

export async function clearPending2fa() {
  (await cookies()).delete(PENDING_COOKIE);
}

// ---------- One-time codes ----------

const otpHash = (target: string, purpose: string, code: string) =>
  createHmac("sha256", secret()).update(`${target}|${purpose}|${code}`).digest("hex");

export type OtpPurpose = "VERIFY_EMAIL" | "VERIFY_MOBILE" | "SIGN_IN" | "RESET_PASSWORD" | "STAFF_2FA";

/** Creates a 6-digit code (stored hashed) and returns it for delivery. Older codes for the same target+purpose are invalidated. */
export async function issueOtp(target: string, purpose: OtpPurpose) {
  const { security } = await getSettings();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.$transaction([
    db.otpCode.updateMany({ where: { target, purpose, consumedAt: null }, data: { consumedAt: new Date() } }),
    db.otpCode.create({
      data: { target, purpose, codeHash: otpHash(target, purpose, code), expiresAt: new Date(Date.now() + security.otpTtlMinutes * 60_000) },
    }),
  ]);
  return code;
}

export async function verifyOtp(target: string, purpose: OtpPurpose, code: string): Promise<boolean> {
  const { security } = await getSettings();
  const otp = await db.otpCode.findFirst({
    where: { target, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.attempts >= security.otpMaxAttempts) return false;
  const ok = timingSafeEqual(Buffer.from(otp.codeHash), Buffer.from(otpHash(target, purpose, code.trim())));
  await db.otpCode.update({ where: { id: otp.id }, data: ok ? { consumedAt: new Date() } : { attempts: { increment: 1 } } });
  return ok;
}

export { ageOn, maskEmail, maskMobile, normaliseAuMobile, passwordProblem } from "@/lib/identity";
