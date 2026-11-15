import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PLATFORM_TZ, fmtTime } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/status";
import { BLOCKING } from "@/server/calendar";
import { addAvailability, removeAvailability } from "@/app/mate-actions";
import StatefulForm from "@/components/StatefulForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: PLATFORM_TZ });

export default async function MateCalendar({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const user = await requireUser("MATE");
  const mateId = user.mateProfile!.id;
  const offset = Number((await searchParams).week) || 0;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay() + offset * 7); // week starts Sunday
  const end = new Date(start.getTime() + 7 * 86400_000);
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 86400_000));

  const [slots, bookings] = await Promise.all([
    db.availability.findMany({ where: { mateId }, orderBy: [{ weekday: "asc" }, { startMin: "asc" }] }),
    db.booking.findMany({
      where: { startsAt: { gte: start, lt: end }, mates: { some: { mateId, response: { in: ["ACCEPTED", "PENDING"] } } }, status: { in: [...BLOCKING, "PENDING_MATE_ACCEPTANCE"] } },
      include: { service: true, mates: { where: { mateId } } },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader title="Calendar & availability" sub="Customers can only request times inside your availability, and accepted bookings can't overlap.">
        <div className="mt-4 flex items-center gap-2 text-sm">
          <Link href={`/mate/calendar?week=${offset - 1}`} className="btn-ghost !py-1.5">← Previous</Link>
          <Link href="/mate/calendar" className="btn-ghost !py-1.5">This week</Link>
          <Link href={`/mate/calendar?week=${offset + 1}`} className="btn-ghost !py-1.5">Next →</Link>
          <span className="text-muted">{days[0].toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – {days[6].toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span>
        </div>
      </PageHeader>
      <div className="mx-auto max-w-6xl space-y-6 px-4">
        <div className="grid gap-2 overflow-x-auto md:grid-cols-7">
          {days.map((d) => {
            const daySlots = slots.filter((s) => s.weekday === d.getDay());
            const dayBookings = bookings.filter((b) => dayKey(b.startsAt) === dayKey(d));
            return (
              <div key={d.toISOString()} className="card min-h-40 p-3 text-xs">
                <p className="font-semibold text-ocean">{DAYS[d.getDay()].slice(0, 3)} {d.getDate()}</p>
                {daySlots.map((s) => <p key={s.id} className="mt-1 rounded-md bg-ocean-100 px-1.5 py-0.5 text-ocean">Available {hhmm(s.startMin)}–{hhmm(s.endMin)}</p>)}
                {dayBookings.map((b) => (
                  <Link key={b.id} href={`/bookings/${b.id}`} className={`mt-1 block rounded-md px-1.5 py-1 ${b.mates[0]?.response === "PENDING" ? "border border-dashed border-coral" : "bg-coral text-ocean-700"}`}>
                    {fmtTime(b.startsAt)}–{fmtTime(b.endsAt)} {b.service.name}
                    <span className="block opacity-80">{b.mates[0]?.response === "PENDING" ? "Request" : STATUS_LABEL[b.status]}</span>
                  </Link>
                ))}
                {!daySlots.length && !dayBookings.length && <p className="mt-1 text-muted">Unavailable</p>}
              </div>
            );
          })}
        </div>

        <section className="card p-6">
          <h2 className="h2">Weekly availability</h2>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {slots.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-xl bg-ivory p-2.5">
                <span>{DAYS[s.weekday]} {hhmm(s.startMin)}–{hhmm(s.endMin)}</span>
                <form action={removeAvailability.bind(null, s.id)}><button className="text-xs text-muted underline">Remove</button></form>
              </li>
            ))}
          </ul>
          <StatefulForm action={addAvailability} submitLabel="Add slot" className="mt-4 flex flex-wrap items-end gap-2 text-sm">
            <select name="weekday" className="input !w-auto" aria-label="Day">{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
            <input type="time" name="start" defaultValue="09:00" className="input !w-auto" aria-label="Start" />
            <input type="time" name="end" defaultValue="17:00" className="input !w-auto" aria-label="End" />
          </StatefulForm>
          <p className="mt-3 text-xs text-muted">Times are Australia/Sydney. Google and Outlook calendar sync is on the roadmap.</p>
        </section>
      </div>
    </>
  );
}
