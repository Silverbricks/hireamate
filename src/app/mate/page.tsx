import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { aud, mateNetCents } from "@/lib/pricing";
import { STATUS_LABEL } from "@/lib/status";
import { fmtDateTime } from "@/lib/format";
import { getSettings } from "@/server/settings";
import { respondToBooking } from "@/app/actions";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_BANNER: Record<string, string> = {
  DRAFT: "Finish your profile to submit it for review.",
  PENDING_REVIEW: "Your profile is being reviewed. It isn't visible in search yet.",
  REJECTED: "Your profile needs changes before it can go live. Edit and resubmit, or contact support.",
  SUSPENDED: "Your profile is suspended. Contact support.",
};

export default async function MateDashboard() {
  const user = await requireUser("MATE");
  const profile = user.mateProfile!;
  const { pricing } = await getSettings();
  const [lines, intros, payouts] = await Promise.all([
    db.bookingMate.findMany({
      where: { mateId: profile.id },
      orderBy: { booking: { startsAt: "asc" } },
      include: { booking: { include: { service: true, taskItems: { include: { service: true } }, customer: { select: { displayName: true } } } } },
    }),
    db.introduction.findMany({ where: { mateId: profile.id, status: { in: ["PENDING", "MORE_INFO"] } }, include: { customer: { select: { displayName: true } } }, orderBy: { createdAt: "desc" } }),
    db.paymentTransaction.findMany({ where: { userId: user.id, kind: "MATE_PAYOUT" } }),
  ]);

  const requests = lines.filter((l) => l.response === "PENDING" && ["PENDING_MATE_ACCEPTANCE", "PARTIALLY_ACCEPTED"].includes(l.booking.status));
  const upcoming = lines.filter((l) => l.response === "ACCEPTED" && !["COMPLETED", "CANCELLED", "REFUNDED"].includes(l.booking.status));
  const pending = payouts.filter((p) => p.status === "PENDING").reduce((a, p) => a + p.amountCents, 0);
  const paid = payouts.filter((p) => p.status === "SUCCEEDED").reduce((a, p) => a + p.amountCents, 0);
  const completed = lines.filter((l) => l.response === "ACCEPTED" && l.booking.status === "COMPLETED");
  const gross = completed.reduce((a, l) => a + l.amountCents, 0);

  return (
    <>
      <PageHeader title={`Hi ${profile.displayName}`} sub="Accept only what suits you. Declining never affects your ranking.">
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/mate/profile" className="btn-ocean">Edit profile & services</Link>
          <Link href="/mate/calendar" className="btn-ghost">Calendar & availability</Link>
          {profile.status === "APPROVED" && <Link href={`/mates/${profile.id}`} className="btn-ghost">View public profile</Link>}
          <Link href="/membership" className="btn-ghost">Membership</Link>
        </div>
        {STATUS_BANNER[profile.status] && (
          <div className="mt-4 rounded-xl bg-coral-100 p-3 text-sm text-coral-600">
            <p>{profile.status === "DRAFT" && profile.statusReason ? "We need more information before approving your profile." : STATUS_BANNER[profile.status]}</p>
            {profile.statusReason && <p className="mt-1"><strong>Reason:</strong> {profile.statusReason}</p>}
            {(profile.status === "REJECTED" || profile.status === "SUSPENDED") && <p className="mt-1">To appeal, <Link href="/help" className="underline">contact support</Link> and choose &ldquo;Appeal a decision&rdquo;.</p>}
          </div>
        )}
      </PageHeader>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-8">
          <section>
            <h2 className="h2">New booking requests ({requests.length})</h2>
            {requests.length === 0 && <p className="mt-2 text-sm text-muted">No new requests right now.</p>}
            <ul className="mt-3 space-y-3">
              {requests.map((l) => (
                <li key={l.id} className="card p-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <div>
                      <Link href={`/bookings/${l.bookingId}`} className="font-semibold text-ocean hover:underline">{l.booking.service.name} · {l.booking.customer.displayName}</Link>
                      <p className="text-sm text-muted">
                        {fmtDateTime(l.booking.startsAt)} · {(l.booking.endsAt.getTime() - l.booking.startsAt.getTime()) / 3600_000} hr · {l.booking.participants} attending
                        {l.booking.distanceKm != null && ` · ${Math.round(l.booking.distanceKm)} km from your area centre`}
                        {l.booking.recurrence !== "ONE_TIME" && ` · part of a ${l.booking.recurrence.toLowerCase()} series`}
                      </p>
                    </div>
                    <p className="font-semibold text-ocean">{aud(mateNetCents(l.amountCents, pricing.mateCommissionRate).net + l.booking.travelFeeCents)} <span className="text-xs font-normal text-muted">payout{l.booking.travelFeeCents ? " incl. travel" : ""}</span></p>
                  </div>
                  <p className="mt-2 rounded-xl bg-ivory p-2 text-sm">{l.booking.description}</p>
                  {l.booking.taskItems.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{l.booking.taskItems.map((t) => <span key={t.id} className="chip">{t.service.name}</span>)}</div>}
                  <div className="mt-3 flex gap-2">
                    <form action={respondToBooking.bind(null, l.bookingId, true)}><button className="btn-ocean">Accept</button></form>
                    <form action={respondToBooking.bind(null, l.bookingId, false)}><button className="btn-ghost">Decline</button></form>
                    <Link href={`/bookings/${l.bookingId}`} className="btn-ghost">Details</Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="h2">Introductions ({intros.length})</h2>
            {intros.length === 0 && <p className="mt-2 text-sm text-muted">No new introductions.</p>}
            <ul className="mt-3 space-y-2">
              {intros.map((i) => (
                <li key={i.id}><Link href={`/introductions/${i.id}`} className="card flex justify-between p-4 text-sm hover:shadow-md"><span><strong className="text-ocean">{i.customer.displayName}</strong> · {i.proposedActivity}{i.wantsFreeMeet && " · asks about a free first meet"}</span><span className="chip">{i.status.toLowerCase().replace("_", " ")}</span></Link></li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="h2">Upcoming</h2>
            {upcoming.length === 0 && <p className="mt-2 text-sm text-muted">Nothing booked yet.</p>}
            <ul className="mt-3 space-y-2">
              {upcoming.map((l) => (
                <li key={l.id}>
                  <Link href={`/bookings/${l.bookingId}`} className="card flex justify-between p-4 text-sm hover:shadow-md">
                    <span><span className="font-semibold text-ocean">{l.booking.service.name}</span> · {l.booking.customer.displayName} · {fmtDateTime(l.booking.startsAt)}</span>
                    <span className="chip">{STATUS_LABEL[l.booking.status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="card h-fit p-5 text-sm">
          <p className="font-semibold text-ocean">Earnings</p>
          <p className="mt-1 text-xs text-muted">{completed.length} completed bookings</p>
          <div className="mt-3 space-y-1">
            <div className="flex justify-between"><span>Gross (completed)</span><span>{aud(gross)}</span></div>
            <div className="flex justify-between"><span>Platform commission ({Math.round(pricing.mateCommissionRate * 100)}%)</span><span>−{aud(gross - mateNetCents(gross, pricing.mateCommissionRate).net)}</span></div>
            <div className="flex justify-between border-t border-ocean/10 pt-1"><span>Pending payout</span><span className="font-semibold text-ocean">{aud(pending)}</span></div>
            <div className="flex justify-between"><span>Paid out</span><span>{aud(paid)}</span></div>
          </div>
          <p className="mt-3 text-xs text-muted">Payouts are recorded after the customer confirms completion and released by the payout run (Stripe Connect, coming). You&apos;re responsible for your own tax.</p>
        </aside>
      </div>
    </>
  );
}
