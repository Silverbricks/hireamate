// Date handling. Bookings are entered and shown in the platform timezone (launch: Australia/Sydney),
// independent of the server's own timezone. Per-state zones come with international/multi-state rollout.
export const PLATFORM_TZ = "Australia/Sydney";

// Note: `weekday` cannot be combined with dateStyle/timeStyle.
export const fmtDateTime = (d: Date, weekday: "short" | "long" = "short") =>
  d.toLocaleString("en-AU", { timeZone: PLATFORM_TZ, weekday, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export const fmtTime = (d: Date) => d.toLocaleTimeString("en-AU", { timeZone: PLATFORM_TZ, hour: "numeric", minute: "2-digit" });
export const fmtDate = (d: Date) => d.toLocaleDateString("en-AU", { timeZone: PLATFORM_TZ, day: "numeric", month: "short", year: "numeric" });

function offsetMinutes(at: Date, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Convert a wall-clock date ("2026-11-20") + time ("18:30") in `tz` to a UTC Date. */
export function parseLocal(date: string, time: string, tz = PLATFORM_TZ): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = offsetMinutes(new Date(guess), tz);
  const result = guess - off1 * 60000;
  const off2 = offsetMinutes(new Date(result), tz);
  return new Date(off1 === off2 ? result : guess - off2 * 60000);
}
