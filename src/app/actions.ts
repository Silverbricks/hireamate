"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Recurrence } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, requireVerifiedUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { aud, estimateTaskHours, mateNetCents, priceBooking } from "@/lib/pricing";
import { screenText } from "@/lib/policy";
import { CHAT_OPEN, MATE_PROGRESS, deriveStatus } from "@/lib/status";
import { fmtDateTime, parseLocal } from "@/lib/format";
import { haversineKm, travelFeeCents } from "@/lib/geo";
import { getSettings } from "@/server/settings";
import { geocode } from "@/server/location";
import { conflicts, withinAvailability } from "@/server/calendar";
import { notify, sendSms } from "@/server/comms/notify";
import { chargeBooking, recordMatePayout, refundBooking } from "@/server/payments";
import { audit } from "@/server/audit";
import { rateLimit } from "@/server/ratelimit";
import { isBlockedBetween } from "@/server/blocks";

export type FormState = { error?: string; ok?: string } | undefined;

// ---------- Booking request (SRS 10.3, addendum 1.5) ----------

const RECURRENCE_STEP_DAYS: Record<Recurrence, number> = { ONE_TIME: 0, DAILY: 1, WEEKLY: 7, FORTNIGHTLY: 14, MONTHLY: 30, WEEKENDS: 7 };

const BookingInput = z.object({
  mateId: z.string().min(1),
  serviceId: z.string().min(1),
  taskIds: z.array(z.string()).default([]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  hours: z.coerce.number().positive().max(12).optional(),
  participants: z.coerce.number().int().min(1).max(20),
  suburb: z.string().trim().min(2, "Choose the suburb where the activity or work happens"),
  meetingPoint: z.string().trim().min(3, "Add a meeting point or street address").max(200),
  description: z.string().trim().min(10, "Describe the activity or work (at least 10 characters)").max(2000),
  expensesNote: z.string().trim().max(500).optional(),
  accessibility: z.string().trim().max(500).optional(),
  expenseLimit: z.coerce.number().min(0).max(1000).optional(),
  recurrence: z.enum(["ONE_TIME", "DAILY", "WEEKLY", "FORTNIGHTLY", "MONTHLY", "WEEKENDS"]),
  policy: z.literal("on", { errorMap: () => ({ message: "Please accept the community policy" }) }),
  freeMeetIntroId: z.string().optional(), // SRS v1.3 s11.3
});

export async function createBooking(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireVerifiedUser();
  if (user.role !== "CUSTOMER") return { error: "Only customer accounts can make bookings." };
  if (!rateLimit(`booking:${user.id}`, 20, 60 * 60_000).ok) return { error: "Too many booking requests. Try again later." };

  const parsed = BookingInput.safeParse({
    ...Object.fromEntries(fd),
    taskIds: fd.getAll("taskIds"),
    hours: Number(fd.get("hours")) || undefined, // 0 = "use task estimate / minimum"
    expenseLimit: fd.get("expenseLimit") || undefined,
    expensesNote: fd.get("expensesNote") || undefined,
    accessibility: fd.get("accessibility") || undefined,
    freeMeetIntroId: fd.get("freeMeetIntroId") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;
  if (input.freeMeetIntroId) input.recurrence = "ONE_TIME";

  for (const t of [input.description, input.meetingPoint, input.expensesNote ?? "", input.accessibility ?? ""]) {
    const s = screenText(t);
    if (!s.ok) return { error: s.reason };
  }

  const settings = await getSettings();
  const mate = await db.mateProfile.findUnique({
    where: { id: input.mateId },
    include: { services: { include: { service: { include: { category: true } } } } },
  });
  if (!mate || mate.status !== "APPROVED") return { error: "This Mate isn't taking bookings right now." };
  if (await isBlockedBetween(user.id, mate.userId)) return { error: "You can't book this Mate." };
  // Services restricted by staff (s7.4) can't be booked.
  const offered = new Map(mate.services.filter((s) => !s.restricted).map((s) => [s.serviceId, s.service]));
  const primary = offered.get(input.serviceId);
  if (!primary || !primary.active || !primary.category.active) return { error: "This Mate doesn't offer that service." };

  const isHousehold = primary.category.kind === "HOUSEHOLD";
  const taskIds = isHousehold ? Array.from(new Set([input.serviceId, ...input.taskIds])) : [];
  const tasks = taskIds.map((id) => offered.get(id));
  if (tasks.some((t) => !t || t.category.kind !== "HOUSEHOLD")) return { error: "One of the selected tasks isn't offered by this Mate." };

  // Free first meet (s11.3): Mate-set duration, $0 service time, only after an accepted introduction, once per pair.
  let freeMeet = false;
  if (input.freeMeetIntroId) {
    const intro = await db.introduction.findUnique({ where: { id: input.freeMeetIntroId } });
    if (!intro || intro.customerId !== user.id || intro.mateId !== mate.id || intro.status !== "ACCEPTED") return { error: "A free first meet needs an accepted introduction." };
    if (!mate.offersFreeFirstMeet || !mate.freeFirstMeetMins) return { error: `${mate.displayName} doesn't offer a free first meet.` };
    if (isHousehold) return { error: "Free first meets are for social activities, not household work." };
    const used = await db.booking.findFirst({ where: { customerId: user.id, isFreeMeet: true, mates: { some: { mateId: mate.id } }, status: { notIn: ["CANCELLED", "REFUNDED"] } } });
    if (used) return { error: `You've already had a free first meet with ${mate.displayName}.` };
    freeMeet = true;
  }
  const estimate = isHousehold ? estimateTaskHours(tasks.map((t) => t!.estMins), primary.minHours) : 0;
  const hours = freeMeet ? mate.freeFirstMeetMins! / 60 : Math.max(input.hours ?? 0, estimate, primary.minHours);
  if (!freeMeet && (hours < mate.minBookingHours || hours > mate.maxBookingHours)) {
    return { error: `${mate.displayName} accepts bookings of ${mate.minBookingHours}–${mate.maxBookingHours} hours. This request is ${hours} hours.` };
  }

  // Location, service area and travel charge (v1.2 s1.3, 1.5).
  const place = await geocode(input.suburb);
  if (!place) return { error: "We couldn't find that suburb. Pick one from the list." };
  const distanceKm = mate.lat != null && mate.lng != null ? Math.round(haversineKm(place, { lat: mate.lat, lng: mate.lng }) * 10) / 10 : null;
  if (distanceKm != null && distanceKm > mate.serviceRadiusKm && !mate.acceptOutsideArea) {
    return { error: `${place.label} is ${distanceKm} km away, outside ${mate.displayName}'s ${mate.serviceRadiusKm} km service area.` };
  }
  // s9.4: fixed + distance-based (with minimum). Free meets carry no travel charge; expenses are disclosed in the note.
  const travel = freeMeet ? 0 : mate.fixedTravelFeeCents + travelFeeCents(distanceKm, mate.travelFeePerKmCents, mate.minTravelFeeCents);

  const startsAt = parseLocal(input.date, input.time);
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now() + 60 * 60_000) return { error: "Choose a start time at least 1 hour from now." };

  const price = freeMeet
    ? priceBooking(hours, [{ ...mate, hourlyRateCents: 0 }], 0, 0, 0)
    : priceBooking(hours, [mate], settings.pricing.customerFeeRate, travel, settings.pricing.customerFixedFeeCents);
  const count = input.recurrence === "ONE_TIME" ? 1 : settings.booking.recurringOccurrences;
  const occurrences: Date[] = [];
  for (let i = 0; i < count; i++) {
    const s = new Date(startsAt);
    if (input.recurrence === "MONTHLY") s.setMonth(s.getMonth() + i);
    else s.setDate(s.getDate() + RECURRENCE_STEP_DAYS[input.recurrence] * i);
    occurrences.push(s);
  }

  // Availability + double-booking checks (v1.2 s10), per occurrence.
  for (const s of occurrences) {
    const e = new Date(s.getTime() + hours * 3600_000);
    if (settings.booking.enforceAvailability && !(await withinAvailability(mate.id, s, e))) {
      return { error: `${mate.displayName} isn't available ${fmtDateTime(s)} for ${hours} hours. Check their usual availability.` };
    }
    if ((await conflicts(mate.id, s, e)).length) return { error: `${mate.displayName} is already booked around ${fmtDateTime(s)}.` };
  }

  const ids: string[] = [];
  await db.$transaction(async (tx) => {
    for (const s of occurrences) {
      const b = await tx.booking.create({
        data: {
          customerId: user.id, serviceId: primary.id, startsAt: s, endsAt: new Date(s.getTime() + hours * 3600_000),
          participants: input.participants, meetingPoint: `${input.meetingPoint}, ${place.label}`, description: input.description,
          expensesNote: input.expensesNote, accessibility: input.accessibility,
          expenseLimitCents: input.expenseLimit ? Math.round(input.expenseLimit * 100) : null,
          recurrence: input.recurrence, policyAcceptedAt: new Date(), isFreeMeet: freeMeet, introductionId: input.freeMeetIntroId ?? null,
          status: "PENDING_MATE_ACCEPTANCE", // payment is taken after the Mate accepts
          subtotalCents: price.subtotalCents, travelFeeCents: price.travelFeeCents, customerFeeCents: price.customerFeeCents, totalCents: price.totalCents,
          lat: place.lat, lng: place.lng, distanceKm,
          mates: { create: price.lines.map((l) => ({ mateId: l.mateId, rateCents: l.rateCents, amountCents: l.amountCents })) },
          taskItems: { create: tasks.map((t) => ({ serviceId: t!.id, estMins: t!.estMins })) },
        },
      });
      ids.push(b.id);
    }
  });
  await audit(user.id, "booking.requested", "Booking", ids[0], { occurrences: ids.length, totalCents: price.totalCents });
  await notify(mate.userId, "BOOKING_REQUESTED", { customer: user.displayName, bookingId: ids[0], service: primary.name, when: fmtDateTime(startsAt) });

  revalidatePath("/bookings");
  redirect(`/bookings/${ids[0]}?new=1`);
}

/** Load a booking only if the current user is its customer, one of its Mates, or an admin. */
async function bookingForUser(bookingId: string) {
  const user = await requireUser();
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { mates: { include: { mate: { select: { userId: true, displayName: true } } } }, service: true },
  });
  if (!booking) throw new Error("Booking not found");
  const isCustomer = booking.customerId === user.id;
  const myLine = user.mateProfile ? booking.mates.find((m) => m.mateId === user.mateProfile!.id) : undefined;
  if (!isCustomer && !myLine && !can(user, "bookings.view")) throw new Error("Not permitted");
  return { user, booking, isCustomer, myLine };
}

const vars = (b: { id: string; startsAt: Date; service: { name: string } }) => ({ bookingId: b.id, service: b.service.name, when: fmtDateTime(b.startsAt) });

// ---------- Mate response (SRS 10.4) ----------

export async function respondToBooking(bookingId: string, accept: boolean) {
  const { user, booking, myLine } = await bookingForUser(bookingId);
  if (!myLine || myLine.response !== "PENDING") return;
  if (!["PENDING_MATE_ACCEPTANCE", "PARTIALLY_ACCEPTED"].includes(booking.status)) return;
  if (accept && (await conflicts(myLine.mateId, booking.startsAt, booking.endsAt, booking.id)).length) {
    redirect(`/bookings/${bookingId}?error=conflict`);
  }

  await db.bookingMate.update({ where: { id: myLine.id }, data: { response: accept ? "ACCEPTED" : "DECLINED", respondedAt: new Date() } });
  const responses = booking.mates.map((m) => (m.id === myLine.id ? (accept ? "ACCEPTED" : "DECLINED") : m.response));
  const derived = deriveStatus(responses);
  // Nobody accepted -> cancelled (no payment was taken). Everyone answered -> awaiting payment.
  const allAnswered = derived === "CONFIRMED" || !responses.includes("PENDING");
  // Free first meets ($0) need no payment and confirm on acceptance.
  const status = derived === "CANCELLED" ? "CANCELLED" : allAnswered ? (booking.totalCents === 0 ? "CONFIRMED" : "PENDING_PAYMENT") : derived;
  await db.booking.update({ where: { id: bookingId }, data: { status } });
  await audit(user.id, accept ? "booking.accepted" : "booking.declined", "Booking", bookingId);
  await notify(booking.customerId, accept ? "BOOKING_ACCEPTED" : "BOOKING_DECLINED", { ...vars(booking), mate: myLine.mate.displayName });
  revalidatePath("/mate");
  revalidatePath(`/bookings/${bookingId}`);
}

// ---------- Payment (after acceptance) ----------

export async function payBooking(_prev: FormState, fd: FormData): Promise<FormState> {
  const bookingId = String(fd.get("bookingId"));
  const { user, booking, isCustomer } = await bookingForUser(bookingId);
  if (!isCustomer) return { error: "Not permitted." };
  if (!["PENDING_PAYMENT", "PARTIALLY_ACCEPTED"].includes(booking.status) || booking.paidAt) return { error: "This booking isn't awaiting payment." };
  const accepted = booking.mates.filter((m) => m.response === "ACCEPTED");
  if (!accepted.length) return { error: "No Mate has accepted yet." };

  // Proceeding with fewer Mates (SRS 10.4): price only the accepted Mates and withdraw the rest.
  const { pricing } = await getSettings();
  const subtotal = accepted.reduce((a, m) => a + m.amountCents, 0);
  const fee = Math.round(subtotal * pricing.customerFeeRate) + (subtotal > 0 ? pricing.customerFixedFeeCents : 0);
  const total = subtotal + booking.travelFeeCents + fee;
  const attempt = (await db.paymentTransaction.count({ where: { bookingId, kind: "BOOKING_CAPTURE" } })) + 1;
  const r = await chargeBooking(user.id, bookingId, total, attempt, fd.get("simulateDecline") === "1", fee);
  if (!r.ok) return { error: `${r.error} Your booking is still held. Try again.` };

  await db.$transaction([
    db.bookingMate.updateMany({ where: { bookingId, response: "PENDING" }, data: { response: "WITHDRAWN" } }),
    db.booking.update({ where: { id: bookingId }, data: { status: "CONFIRMED", paidAt: new Date(), subtotalCents: subtotal, customerFeeCents: fee, totalCents: total } }),
  ]);
  await notify(user.id, "PAYMENT_RECEIVED", { ...vars(booking), amount: aud(total) });
  await notify(user.id, "BOOKING_CONFIRMED", vars(booking));
  for (const m of accepted) await notify(m.mate.userId, "BOOKING_CONFIRMED", vars(booking));
  revalidatePath(`/bookings/${bookingId}`);
  redirect(`/bookings/${bookingId}`);
}

// ---------- Lifecycle ----------

export async function advanceBooking(bookingId: string) {
  const { user, booking, myLine } = await bookingForUser(bookingId);
  if (!myLine || myLine.response !== "ACCEPTED") return;
  const next = MATE_PROGRESS[booking.status];
  if (!next) return;
  await db.booking.update({ where: { id: bookingId }, data: { status: next } });
  await audit(user.id, `booking.${next.toLowerCase()}`, "Booking", bookingId);
  if (next === "MATE_ON_WAY") await notify(booking.customerId, "MATE_ON_WAY", { ...vars(booking), mate: myLine.mate.displayName });
  revalidatePath("/mate");
  revalidatePath(`/bookings/${bookingId}`);
}

/** Customer confirms completion (addendum 1.5 step 14); Mate payouts are recorded as pending. */
export async function confirmCompletion(bookingId: string) {
  const { user, booking, isCustomer } = await bookingForUser(bookingId);
  if (!isCustomer || !["IN_PROGRESS", "CHECKED_IN"].includes(booking.status)) return;
  const { pricing } = await getSettings();
  const accepted = booking.mates.filter((m) => m.response === "ACCEPTED");
  await db.$transaction([
    db.booking.update({ where: { id: bookingId }, data: { status: "COMPLETED" } }),
    ...accepted.map((m) => db.mateProfile.update({ where: { id: m.mateId }, data: { completedBookings: { increment: 1 } } })),
  ]);
  // Travel charges pass through to the Mate(s) without commission.
  const travelShare = accepted.length ? Math.round(booking.travelFeeCents / accepted.length) : 0;
  // s13.4: category commission override, else platform default.
  const category = await db.category.findFirst({ where: { services: { some: { id: booking.serviceId } } }, select: { commissionRate: true } });
  const rate = category?.commissionRate ?? pricing.mateCommissionRate;
  for (const m of accepted) {
    const n = mateNetCents(m.amountCents, rate);
    if (n.gross + travelShare === 0) continue; // free first meet: nothing to pay out
    await recordMatePayout(m.mate.userId, m.mateId, bookingId, n.net + travelShare, n.gross, n.commission);
  }
  await audit(user.id, "booking.completed", "Booking", bookingId);
  await notify(user.id, "BOOKING_COMPLETED", vars(booking));
  revalidatePath(`/bookings/${bookingId}`);
}

export async function cancelBooking(bookingId: string) {
  const { user, booking, isCustomer, myLine } = await bookingForUser(bookingId);
  const cancellable = ["PENDING_MATE_ACCEPTANCE", "PARTIALLY_ACCEPTED", "PENDING_PAYMENT", "CONFIRMED"];
  if (!cancellable.includes(booking.status)) return;
  const { booking: rules } = await getSettings();
  let status = booking.status;

  if (isCustomer) {
    if (!booking.paidAt) status = "CANCELLED";
    else if (booking.startsAt.getTime() - Date.now() > rules.freeCancellationHours * 3600_000) {
      const r = await refundBooking(bookingId, user.id);
      status = r?.ok ? "REFUNDED" : "CANCELLATION_REQUESTED";
      if (r?.ok) await notify(user.id, "REFUND_PROCESSED", { ...vars(booking), amount: aud(r.tx.amountCents) });
    } else status = "CANCELLATION_REQUESTED"; // late cancellation: reviewed under the cancellation policy
    for (const m of booking.mates.filter((x) => x.response === "ACCEPTED" || x.response === "PENDING")) {
      await notify(m.mate.userId, "BOOKING_CANCELLED", vars(booking));
    }
  } else if (myLine && myLine.response === "ACCEPTED") {
    await db.bookingMate.update({ where: { id: myLine.id }, data: { response: "WITHDRAWN" } });
    const remaining = booking.mates.filter((m) => m.id !== myLine.id).map((m) => m.response);
    const stillAccepted = remaining.includes("ACCEPTED");
    if (!stillAccepted && !remaining.includes("PENDING")) {
      if (booking.paidAt) {
        const r = await refundBooking(bookingId, user.id);
        status = r?.ok ? "REFUNDED" : "CANCELLATION_REQUESTED";
        if (r?.ok) await notify(booking.customerId, "REFUND_PROCESSED", { ...vars(booking), amount: aud(r.tx.amountCents) });
      } else status = "CANCELLED";
    }
    await notify(booking.customerId, "BOOKING_CANCELLED", vars(booking));
  } else return;

  await db.booking.update({ where: { id: bookingId }, data: { status } });
  await audit(user.id, "booking.cancelled", "Booking", bookingId, { by: isCustomer ? "customer" : "mate", status });
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/mate");
}

// ---------- Messaging (SRS 18) ----------

export async function sendMessage(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const body = String(fd.get("body") ?? "").trim();
  if (!body) return;
  if (body.length > 1000) return { error: "Messages are limited to 1000 characters." };
  if (!rateLimit(`msg:${user.id}`, 30, 60_000).ok) return { error: "You're sending messages too quickly." };
  const s = screenText(body);
  if (!s.ok) return { error: s.reason };

  const bookingId = (fd.get("bookingId") as string) || null;
  const introductionId = (fd.get("introductionId") as string) || null;
  let recipients: string[] = [];
  let link = "";

  if (bookingId) {
    const { booking, isCustomer, myLine } = await bookingForUser(bookingId);
    // Chat opens only once a Mate accepts. Gifts never unlock chat.
    if (!CHAT_OPEN.includes(booking.status)) return { error: "Messaging opens once a Mate accepts the booking." };
    if (!isCustomer && myLine?.response !== "ACCEPTED") return { error: "Not permitted." };
    recipients = isCustomer ? booking.mates.filter((m) => m.response === "ACCEPTED").map((m) => m.mate.userId) : [booking.customerId];
    for (const r of recipients) if (await isBlockedBetween(user.id, r)) return { error: "You can't message this person." };
    link = `/bookings/${bookingId}`;
  } else if (introductionId) {
    const intro = await db.introduction.findUnique({ where: { id: introductionId }, include: { mate: { select: { userId: true } } } });
    if (!intro || (intro.customerId !== user.id && intro.mate.userId !== user.id)) return { error: "Not permitted." };
    if (intro.status !== "ACCEPTED") return { error: "Chat opens once the Mate accepts your introduction." };
    recipients = [intro.customerId === user.id ? intro.mate.userId : intro.customerId];
    if (await isBlockedBetween(user.id, recipients[0])) return { error: "You can't message this person." };
    link = `/introductions/${introductionId}`;
  } else return { error: "Missing conversation." };

  await db.message.create({ data: { bookingId, introductionId, senderId: user.id, body } });
  for (const r of recipients) await notify(r, "NEW_MESSAGE", { sender: user.displayName, link });
  revalidatePath(link);
  return { ok: "sent" };
}

// ---------- Reviews (SRS 19) ----------

export async function submitReview(_prev: FormState, fd: FormData): Promise<FormState> {
  const bookingId = String(fd.get("bookingId"));
  const mateId = String(fd.get("mateId"));
  const rating = Number(fd.get("rating"));
  const comment = String(fd.get("comment") ?? "").trim();
  const { user, booking, isCustomer } = await bookingForUser(bookingId);
  if (!isCustomer || booking.status !== "COMPLETED") return { error: "Reviews are only for completed bookings." };
  if (!booking.mates.some((m) => m.mateId === mateId && m.response === "ACCEPTED")) return { error: "Not permitted." };
  if (!(rating >= 1 && rating <= 5) || comment.length < 5) return { error: "Choose a rating and write a short comment." };
  const s = screenText(comment);
  if (!s.ok) return { error: s.reason };
  try {
    await db.review.create({ data: { bookingId, reviewerId: user.id, mateId, rating, comment } });
  } catch {
    return { error: "You've already reviewed this booking." };
  }
  revalidatePath(`/bookings/${bookingId}`);
  return { ok: "Thanks for your review." };
}

// ---------- Reporting (addendum 2.6) ----------

export async function submitReport(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const reason = String(fd.get("reason") ?? "");
  const details = String(fd.get("details") ?? "").trim();
  const bookingId = (fd.get("bookingId") as string) || null;
  const mateId = (fd.get("mateId") as string) || null;
  if (!reason || details.length < 5) return { error: "Choose a reason and describe what happened." };
  if (!rateLimit(`report:${user.id}`, 10, 60 * 60_000).ok) return { error: "Too many reports. Contact support if this is urgent." };
  if (bookingId) await bookingForUser(bookingId);
  const r = await db.report.create({ data: { reporterId: user.id, reason, details, bookingId, mateId } });
  await audit(user.id, "safety.report", "Report", r.id, { reason });
  return { ok: "Report received. Our safety team will review it. If anyone is in immediate danger, call 000." };
}

// ---------- Groups (SRS 12) ----------

export async function joinGroup(groupId: string) {
  const user = await requireVerifiedUser();
  const g = await db.groupActivity.findUnique({ where: { id: groupId }, include: { _count: { select: { participants: true } } } });
  if (!g || g._count.participants >= g.places || g.startsAt < new Date()) return;
  await db.groupParticipant.upsert({
    where: { groupId_userId: { groupId, userId: user.id } },
    create: { groupId, userId: user.id, consented: true },
    update: {},
  });
  revalidatePath("/groups");
}

// ---------- Safety: SOS during a booking (SRS v1.3 s19.3) ----------
// Not an emergency response service: the UI tells people to call 000. This alerts the safety team and,
// if set, texts the person's emergency contact.

export async function raiseSos(bookingId: string) {
  const { user, booking, isCustomer, myLine } = await bookingForUser(bookingId);
  if (!isCustomer && !myLine) return;
  if (!["MATE_ON_WAY", "CHECKED_IN", "IN_PROGRESS", "CONFIRMED"].includes(booking.status)) return;
  if (!rateLimit(`sos:${user.id}`, 3, 10 * 60_000).ok) return;
  const t = await db.supportTicket.create({
    data: {
      requesterId: user.id, bookingId, category: "Safety incident", subject: `SOS during booking ${bookingId.slice(-6)}`,
      status: "ESCALATED", priority: "URGENT", restricted: true,
      messages: { create: { authorId: user.id, body: `SOS raised by ${user.displayName} during ${booking.service.name} (${fmtDateTime(booking.startsAt)}). Meeting point: ${booking.meetingPoint}.` } },
    },
  });
  await audit(user.id, "safety.sos", "Booking", bookingId, { ticketId: t.id });
  const safetyStaff = await db.user.findMany({ where: { role: "ADMIN", status: "ACTIVE", staffRole: { in: ["SUPER_ADMIN", "GENERAL_MANAGER", "OPERATIONS_MANAGER", "SAFETY_OFFICER", "COMPLAINTS_OFFICER"] } }, select: { id: true } });
  for (const s of safetyStaff) await notify(s.id, "SOS_RAISED", { bookingId: bookingId.slice(-6), ticketId: t.id });
  if (user.emergencyContactMobile) {
    await sendSms(user.emergencyContactMobile, `HIRE A MATE: ${user.displayName} has raised a safety alert during a booking. Please try to contact them. If you think they are in danger, call 000.`, user.id, "SOS_CONTACT");
  }
  redirect(`/bookings/${bookingId}?sos=1`);
}

export async function blockUser(otherUserId: string, back: string) {
  const user = await requireUser();
  if (otherUserId === user.id) return;
  await db.block.upsert({ where: { blockerId_blockedId: { blockerId: user.id, blockedId: otherUserId } }, create: { blockerId: user.id, blockedId: otherUserId }, update: {} });
  await audit(user.id, "safety.block", "User", otherUserId);
  revalidatePath(back);
  redirect(back.startsWith("/") ? back : "/");
}

export async function unblockUser(otherUserId: string) {
  const user = await requireUser();
  await db.block.deleteMany({ where: { blockerId: user.id, blockedId: otherUserId } });
  await audit(user.id, "safety.unblock", "User", otherUserId);
  revalidatePath("/account");
}
