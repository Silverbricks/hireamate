"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, requireVerifiedUser } from "@/lib/session";
import { screenText } from "@/lib/policy";
import { CATEGORIES } from "@/server/comms/events";
import { notify } from "@/server/comms/notify";
import { geocode } from "@/server/location";
import { LimitError, assertWithinLimit } from "@/server/membership";
import { chargeSubscription } from "@/server/payments";
import { audit } from "@/server/audit";
import { rateLimit } from "@/server/ratelimit";
import { can } from "@/lib/permissions";
import { isBlockedBetween } from "@/server/blocks";
import { fmtDate } from "@/lib/format";
import { normaliseAuMobile } from "@/lib/identity";
import type { FormState } from "./actions";

// ---------- Notification centre (v1.2 s4.4) ----------

export async function markRead(id: string) {
  const user = await requireUser();
  await db.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
}

export async function markAllRead() {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
}

export async function archiveNotification(id: string) {
  const user = await requireUser();
  await db.notification.updateMany({ where: { id, userId: user.id }, data: { archived: true, readAt: new Date() } });
  revalidatePath("/notifications");
}

export async function openNotification(id: string) {
  const user = await requireUser();
  const n = await db.notification.findFirst({ where: { id, userId: user.id } });
  if (!n) return;
  await db.notification.update({ where: { id }, data: { readAt: n.readAt ?? new Date() } });
  redirect(n.link ?? "/notifications");
}

// ---------- Preferences (v1.2 s4.3) ----------

const toMin = (t: string) => (/^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null);

export async function savePreferences(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const cats = Object.entries(CATEGORIES).filter(([, c]) => !c.essential).map(([k]) => k);
  await db.$transaction([
    ...cats.map((category) =>
      db.notificationPreference.upsert({
        where: { userId_category: { userId: user.id, category } },
        create: { userId: user.id, category, email: fd.get(`${category}.email`) === "on", sms: fd.get(`${category}.sms`) === "on", push: fd.get(`${category}.push`) === "on" },
        update: { email: fd.get(`${category}.email`) === "on", sms: fd.get(`${category}.sms`) === "on", push: fd.get(`${category}.push`) === "on" },
      }),
    ),
    db.user.update({
      where: { id: user.id },
      data: {
        emergencyContactName: String(fd.get("emergencyContactName") ?? "").trim() || null,
        emergencyContactMobile: normaliseAuMobile(String(fd.get("emergencyContactMobile") ?? "")) ?? null,
        quietStartMin: fd.get("quietEnabled") === "on" ? toMin(String(fd.get("quietStart"))) : null,
        quietEndMin: fd.get("quietEnabled") === "on" ? toMin(String(fd.get("quietEnd"))) : null,
        marketingConsent: fd.get("MARKETING.email") === "on" || fd.get("MARKETING.sms") === "on",
        locale: String(fd.get("locale") || "en-AU"),
      },
    }),
  ]);
  await audit(user.id, "account.preferences_updated", "User", user.id);
  revalidatePath("/account");
  return { ok: "Preferences saved." };
}

// ---------- Saved locations (v1.2 s1.2) ----------

export async function addSavedLocation(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const label = String(fd.get("label") ?? "").trim() || "Other";
  const address = String(fd.get("address") ?? "").trim();
  const suburb = String(fd.get("suburb") ?? "").trim();
  const place = await geocode(suburb || address);
  if (!place) return { error: "We couldn't find that suburb. Pick one from the list." };
  if ((await db.savedLocation.count({ where: { userId: user.id } })) >= 10) return { error: "You can save up to 10 locations." };
  await db.savedLocation.create({ data: { userId: user.id, label, address: address ? `${address}, ${place.label}` : place.label, lat: place.lat, lng: place.lng } });
  revalidatePath("/account");
  return { ok: "Location saved." };
}

export async function deleteSavedLocation(id: string) {
  const user = await requireUser();
  await db.savedLocation.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/account");
}

// ---------- Favourites (limit enforced server-side, v1.2 s5.4) ----------

export async function toggleFavourite(mateId: string) {
  const user = await requireUser("CUSTOMER");
  const existing = await db.favourite.findUnique({ where: { userId_mateId: { userId: user.id, mateId } } });
  if (existing) {
    await db.favourite.delete({ where: { userId_mateId: { userId: user.id, mateId } } });
  } else {
    try {
      await assertWithinLimit(user, "favourites");
    } catch (e) {
      if (e instanceof LimitError) redirect(`/mates/${mateId}?limit=favourites`);
      throw e;
    }
    await db.favourite.create({ data: { userId: user.id, mateId } });
  }
  revalidatePath(`/mates/${mateId}`);
  revalidatePath("/account");
}

// ---------- Introduce Yourself (SRS 17) ----------

export async function sendIntroduction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireVerifiedUser("CUSTOMER");
  const mateId = String(fd.get("mateId"));
  const message = String(fd.get("message") ?? "").trim();
  const proposedActivity = String(fd.get("proposedActivity") ?? "").trim();
  if (message.length < 20) return { error: "Write a short, respectful introduction (at least 20 characters)." };
  if (proposedActivity.length < 3) return { error: "Suggest an activity." };
  for (const t of [message, proposedActivity]) {
    const s = screenText(t);
    if (!s.ok) return { error: s.reason };
  }
  if (!rateLimit(`intro:${user.id}`, 10, 60 * 60_000).ok) return { error: "Too many introductions. Try again later." };
  const mate = await db.mateProfile.findUnique({ where: { id: mateId } });
  if (!mate || mate.status !== "APPROVED") return { error: "This Mate isn't available." };
  if (await isBlockedBetween(user.id, mate.userId)) return { error: "You can't contact this Mate." };
  // s11.2: Mate-set weekly cap on new introductions.
  if (mate.introWeeklyLimit != null) {
    const thisWeek = await db.introduction.count({ where: { mateId, createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } } });
    if (thisWeek >= mate.introWeeklyLimit) return { error: `${mate.displayName} isn't accepting new introductions this week. Try again later.` };
  }
  const open = await db.introduction.findFirst({ where: { customerId: user.id, mateId, status: { in: ["PENDING", "MORE_INFO"] } } });
  if (open) return { error: "You already have an introduction waiting for this Mate." };
  try {
    await assertWithinLimit(user, "introductionsPerMonth");
  } catch (e) {
    if (e instanceof LimitError) return { error: e.message };
    throw e;
  }
  const intro = await db.introduction.create({
    data: { customerId: user.id, mateId, message, proposedActivity, wantsFreeMeet: fd.get("wantsFreeMeet") === "on" && mate.offersFreeFirstMeet },
  });
  await notify(mate.userId, "INTRO_RECEIVED", { customer: user.displayName, introId: intro.id });
  redirect(`/introductions/${intro.id}`);
}

export async function answerIntroduction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("MATE");
  const id = String(fd.get("introductionId"));
  const decision = String(fd.get("decision"));
  const reply = String(fd.get("reply") ?? "").trim();
  if (!["ACCEPTED", "DECLINED", "MORE_INFO"].includes(decision)) return { error: "Choose a response." };
  if (reply) {
    const s = screenText(reply);
    if (!s.ok) return { error: s.reason };
  }
  const intro = await db.introduction.findUnique({ where: { id } });
  if (!intro || intro.mateId !== user.mateProfile?.id) return { error: "Not permitted." };
  await db.introduction.update({
    where: { id },
    data: { status: decision as "ACCEPTED" | "DECLINED" | "MORE_INFO", mateReply: reply || null, respondedAt: new Date() },
  });
  await notify(intro.customerId, "INTRO_ANSWERED", { mate: user.mateProfile!.displayName, introId: id });
  revalidatePath(`/introductions/${id}`);
  revalidatePath("/mate");
  return { ok: "Response sent." };
}

// ---------- Membership (v1.2 s5) ----------

export async function subscribe(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireVerifiedUser();
  const plan = await db.subscriptionPlan.findUnique({ where: { id: String(fd.get("planId")) } });
  const interval = fd.get("interval") === "ANNUAL" ? "ANNUAL" : "MONTHLY";
  if (!plan || !plan.active || plan.audience !== user.role) return { error: "That plan isn't available for your account." };

  const current = await db.userSubscription.findFirst({ where: { userId: user.id, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } } });
  if (current?.planId === plan.id && !current.cancelAtPeriodEnd) return { error: "You're already on this plan." };

  const periodEnd = new Date();
  if (interval === "ANNUAL") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  if (plan.monthlyCents === 0) {
    // Downgrade to free: end the paid plan at period end (no proration in the MVP).
    if (current) await db.userSubscription.update({ where: { id: current.id }, data: { cancelAtPeriodEnd: true } });
    await audit(user.id, "membership.downgrade_scheduled", "UserSubscription", current?.id);
    revalidatePath("/membership");
    return { ok: current ? `Your plan will switch to ${plan.name} on ${fmtDate(current.currentPeriodEnd)}.` : `You're on ${plan.name}.` };
  }

  const sub = await db.userSubscription.create({
    data: { userId: user.id, planId: plan.id, interval, status: plan.trialDays ? "TRIALING" : "ACTIVE", currentPeriodEnd: plan.trialDays ? new Date(Date.now() + plan.trialDays * 86400_000) : periodEnd },
  });
  if (!plan.trialDays) {
    const amount = interval === "ANNUAL" ? plan.annualCents : plan.monthlyCents;
    const r = await chargeSubscription(user.id, sub.id, amount, new Date().toISOString().slice(0, 7), plan.name);
    if (!r.ok) {
      await db.userSubscription.update({ where: { id: sub.id }, data: { status: "EXPIRED" } });
      return { error: r.error };
    }
  }
  if (current) await db.userSubscription.update({ where: { id: current.id }, data: { status: "CANCELLED" } }); // upgrade: replace immediately
  await audit(user.id, "membership.subscribed", "UserSubscription", sub.id, { plan: plan.slug, interval });
  await notify(user.id, "MEMBERSHIP_ACTIVATED", { plan: plan.name });
  revalidatePath("/membership");
  return { ok: `${plan.name} is active.` };
}

export async function cancelMembership() {
  const user = await requireUser();
  const sub = await db.userSubscription.findFirst({ where: { userId: user.id, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } }, include: { plan: true } });
  if (!sub) return;
  await db.userSubscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true } });
  await audit(user.id, "membership.cancel_scheduled", "UserSubscription", sub.id);
  await notify(user.id, "MEMBERSHIP_CANCELLED", { plan: sub.plan.name, date: fmtDate(sub.currentPeriodEnd) });
  revalidatePath("/membership");
}

// ---------- Support tickets (v1.2 s11) ----------

const SAFETY_CATEGORIES = ["Safety incident", "Inappropriate request", "Harassment", "Fraud"];

export async function createTicket(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const category = String(fd.get("category") ?? "");
  const subject = String(fd.get("subject") ?? "").trim();
  const body = String(fd.get("body") ?? "").trim();
  const bookingId = (fd.get("bookingId") as string) || null;
  if (!category || subject.length < 4 || body.length < 10) return { error: "Choose a category and describe the issue." };
  if (!rateLimit(`ticket:${user.id}`, 10, 60 * 60_000).ok) return { error: "Too many tickets. We'll reply to your open ones soon." };
  const safety = SAFETY_CATEGORIES.includes(category);
  const t = await db.supportTicket.create({
    data: {
      requesterId: user.id, category, subject, bookingId,
      status: safety ? "ESCALATED" : "OPEN", priority: safety ? "URGENT" : "NORMAL", restricted: safety,
      messages: { create: { authorId: user.id, body } },
    },
  });
  await audit(user.id, "support.ticket_created", "SupportTicket", t.id, { category, safety });
  redirect(`/help/tickets/${t.id}`);
}

export async function replyTicket(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const ticketId = String(fd.get("ticketId"));
  const body = String(fd.get("body") ?? "").trim();
  const staff = can(user, "support.manage");
  const internal = fd.get("internal") === "on" && staff;
  if (!body) return;
  const t = await db.supportTicket.findUnique({ where: { id: ticketId } });
  if (!t || (t.requesterId !== user.id && !staff)) return { error: "Not permitted." };
  if (staff && t.requesterId !== user.id && t.restricted && !can(user, "safety.manage")) return { error: "Not permitted." };
  await db.supportTicketMessage.create({ data: { ticketId, authorId: user.id, body, internal } });
  if (staff && !internal) {
    await db.supportTicket.update({ where: { id: ticketId }, data: { status: t.requesterId === user.id ? t.status : "WAITING_CUSTOMER", firstResponseAt: t.firstResponseAt ?? new Date() } });
    await notify(t.requesterId, "TICKET_UPDATED", { number: t.number, ticketId });
  } else if (user.id === t.requesterId && ["WAITING_CUSTOMER", "WAITING_MATE", "RESOLVED"].includes(t.status)) {
    await db.supportTicket.update({ where: { id: ticketId }, data: { status: "IN_PROGRESS" } });
  }
  revalidatePath(`/help/tickets/${ticketId}`);
  revalidatePath(`/admin/support`);
  return { ok: "sent" };
}
