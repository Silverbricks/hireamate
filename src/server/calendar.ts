import "server-only";
import type { BookingStatus } from "@prisma/client";
import { db } from "@/lib/db";

// Scheduling rules (v1.2 s10), enforced on the backend.

/** Statuses in which a Mate's time is committed. */
export const BLOCKING: BookingStatus[] = ["PENDING_PAYMENT", "PARTIALLY_ACCEPTED", "CONFIRMED", "MATE_ON_WAY", "CHECKED_IN", "IN_PROGRESS"];

const TZ = "Australia/Sydney"; // TODO: per-Mate timezone once Mates outside NSW/VIC/TAS/ACT are onboarded

function localParts(d: Date) {
  const p = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(d);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.find((x) => x.type === "weekday")!.value);
  return { weekday: wd, minutes: Number(p.find((x) => x.type === "hour")!.value) * 60 + Number(p.find((x) => x.type === "minute")!.value) };
}

/** True when [start, end) falls inside one of the Mate's weekly availability windows (same day). */
export async function withinAvailability(mateId: string, start: Date, end: Date) {
  const s = localParts(start);
  const e = localParts(end);
  const endMin = e.weekday === s.weekday ? e.minutes : e.minutes === 0 ? 24 * 60 : -1;
  if (endMin < 0) return false; // spans days; extended/overnight bookings need the travel workflow
  const slots = await db.availability.findMany({ where: { mateId, weekday: s.weekday } });
  return slots.some((a) => a.startMin <= s.minutes && a.endMin >= endMin);
}

/** Overlapping committed bookings for this Mate (optionally ignoring one booking). */
export async function conflicts(mateId: string, start: Date, end: Date, excludeBookingId?: string) {
  return db.booking.findMany({
    where: {
      id: excludeBookingId ? { not: excludeBookingId } : undefined,
      status: { in: BLOCKING },
      startsAt: { lt: end },
      endsAt: { gt: start },
      mates: { some: { mateId, response: "ACCEPTED" } },
    },
    select: { id: true, startsAt: true, endsAt: true },
  });
}
