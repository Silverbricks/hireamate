import { fmtDateTime } from "@/lib/format";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { aud } from "@/lib/pricing";
import { STATUS_LABEL } from "@/lib/status";
import { Avatar, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MyBookings() {
  const user = await requireUser("CUSTOMER");
  const [bookings, groups] = await Promise.all([
    db.booking.findMany({
      where: { customerId: user.id },
      orderBy: { startsAt: "desc" },
      include: { service: true, mates: { include: { mate: { select: { displayName: true, avatarHue: true } } } }, taskItems: true },
    }),
    db.groupParticipant.findMany({ where: { userId: user.id }, include: { group: true } }),
  ]);
  const now = Date.now();
  const upcoming = bookings.filter((b) => b.startsAt.getTime() >= now);
  const past = bookings.filter((b) => b.startsAt.getTime() < now);

  return (
    <>
      <PageHeader title={`Hi ${user.displayName}`} sub="Your bookings, group activities and reviews.">
        <Link href="/#need" className="btn-primary mt-4">Book something new</Link>
      </PageHeader>
      <div className="mx-auto max-w-6xl space-y-8 px-4">
        <List title="Upcoming" items={upcoming} />
        {groups.length > 0 && (
          <section>
            <h2 className="h2">Group activities</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {groups.map((g) => (
                <li key={g.groupId} className="card p-4 text-sm">
                  <p className="font-semibold text-ocean">{g.group.title}</p>
                  <p className="text-muted">{g.group.startsAt.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })} · {g.group.suburb}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
        <List title="Past" items={past} />
      </div>
    </>
  );
}

type B = Prisma.BookingGetPayload<{
  include: { service: true; mates: { include: { mate: { select: { displayName: true; avatarHue: true } } } }; taskItems: true };
}>[];

function List({ title, items }: { title: string; items: B }) {
  return (
    <section>
      <h2 className="h2">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nothing here yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((b) => (
            <li key={b.id}>
              <Link href={`/bookings/${b.id}`} className="card flex items-center gap-4 p-4 hover:shadow-md">
                {b.mates[0] && <Avatar name={b.mates[0].mate.displayName} hue={b.mates[0].mate.avatarHue} size={44} />}
                <div className="flex-1">
                  <p className="font-semibold text-ocean">
                    {b.service.name}{b.taskItems.length > 1 ? ` + ${b.taskItems.length - 1} more task${b.taskItems.length > 2 ? "s" : ""}` : ""} with {b.mates.map((m) => m.mate.displayName).join(", ")}
                  </p>
                  <p className="text-sm text-muted">
                    {fmtDateTime(b.startsAt, "short")}
                    {b.recurrence !== "ONE_TIME" && ` · repeats ${b.recurrence.toLowerCase().replace("_", " ")}`}
                  </p>
                </div>
                <div className="text-right">
                  <span className="chip">{STATUS_LABEL[b.status]}</span>
                  <p className="mt-1 text-sm font-semibold text-ocean">{aud(b.totalCents)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
