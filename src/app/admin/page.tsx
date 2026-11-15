import Link from "next/link";
import { db } from "@/lib/db";
import { aud } from "@/lib/pricing";
import { fmtDateTime } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/status";
import { setReportStatus } from "@/app/admin-actions";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Admin → Analytics & Reports (v1.2 s13). All figures are actuals from the database and payments ledger. */
export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const staff = await requireUser("ADMIN");
  if (!can(staff, "analytics.view")) {
    const first = ADMIN_NAV.find(([, , p]) => can(staff, p));
    redirect(first ? first[0] : "/admin/forbidden");
  }
  const showSafety = can(staff, "safety.manage");
  const days = Math.min(Number((await searchParams).days) || 30, 365);
  const since = new Date(Date.now() - days * 86400_000);

  const [customers, mates, verifiedMates, approvedMates, newUsers, byStatus, ledger, pendingMates, reports, openTickets, byCategory, responses, repeatCustomers] = await Promise.all([
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.user.count({ where: { role: "MATE" } }),
    db.mateProfile.count({ where: { verified: true } }),
    db.mateProfile.count({ where: { status: "APPROVED" } }),
    db.user.count({ where: { createdAt: { gte: since } } }),
    db.booking.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: true, _sum: { totalCents: true } }),
    db.paymentTransaction.groupBy({ by: ["kind", "status"], where: { createdAt: { gte: since } }, _sum: { amountCents: true }, _count: true }),
    db.mateProfile.count({ where: { status: "PENDING_REVIEW" } }),
    db.report.findMany({ where: { status: { in: ["OPEN", "INVESTIGATING"] } }, orderBy: { createdAt: "desc" }, include: { reporter: { select: { displayName: true, role: true } } } }),
    db.supportTicket.count({ where: { status: { notIn: ["RESOLVED", "CLOSED"] } } }),
    db.booking.groupBy({ by: ["serviceId"], where: { createdAt: { gte: since } }, _count: true }),
    db.bookingMate.groupBy({ by: ["response"], where: { booking: { createdAt: { gte: since } } }, _count: true }),
    db.booking.groupBy({ by: ["customerId"], where: { status: "COMPLETED" }, _count: true, having: { customerId: { _count: { gt: 1 } } } }),
  ]);

  const sum = (kind: string) => ledger.filter((l) => l.kind === kind && l.status === "SUCCEEDED").reduce((a, l) => a + (l._sum.amountCents ?? 0), 0);
  const captured = sum("BOOKING_CAPTURE");
  const refunds = sum("REFUND");
  const subs = sum("SUBSCRIPTION");
  const payoutsOwed = ledger.filter((l) => l.kind === "MATE_PAYOUT").reduce((a, l) => a + (l._sum.amountCents ?? 0), 0);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const totalBookings = byStatus.reduce((a, b) => a + b._count, 0);
  const paidBookings = byStatus.filter((b) => !["PENDING_MATE_ACCEPTANCE", "PENDING_PAYMENT", "PARTIALLY_ACCEPTED", "CANCELLED", "DRAFT"].includes(b.status)).reduce((a, b) => a + b._count, 0);
  const respTotal = responses.filter((r) => r.response !== "PENDING").reduce((a, r) => a + r._count, 0);
  const acceptRate = respTotal ? (responses.find((r) => r.response === "ACCEPTED")?._count ?? 0) / respTotal : null;
  const services = await db.service.findMany({ where: { id: { in: byCategory.map((b) => b.serviceId) } }, include: { category: true } });
  const catCounts = new Map<string, number>();
  for (const b of byCategory) {
    const c = services.find((s) => s.id === b.serviceId)?.category.name ?? "Other";
    catCounts.set(c, (catCounts.get(c) ?? 0) + b._count);
  }

  // SRS v1.3 s20.2 / s20.4: commission, net revenue and operational metrics, all from recorded data.
  const [captures, payouts, cancels, responded, resolved, safetyReports, safetyTickets, disputes] = await Promise.all([
    db.paymentTransaction.findMany({ where: { kind: "BOOKING_CAPTURE", status: "SUCCEEDED", createdAt: { gte: since } }, select: { bookingId: true, feeCents: true } }),
    db.paymentTransaction.aggregate({ where: { kind: "MATE_PAYOUT", createdAt: { gte: since } }, _sum: { commissionCents: true } }),
    db.auditLog.findMany({ where: { action: "booking.cancelled", createdAt: { gte: since } }, select: { meta: true } }),
    db.bookingMate.findMany({ where: { respondedAt: { not: null }, booking: { createdAt: { gte: since } } }, select: { respondedAt: true, booking: { select: { createdAt: true } } } }),
    db.supportTicket.findMany({ where: { resolvedAt: { not: null }, createdAt: { gte: since } }, select: { createdAt: true, resolvedAt: true } }),
    db.report.count({ where: { createdAt: { gte: since } } }),
    db.supportTicket.count({ where: { restricted: true, createdAt: { gte: since } } }),
    db.booking.count({ where: { status: "DISPUTED", createdAt: { gte: since } } }),
  ]);
  const refundedIds = new Set((await db.paymentTransaction.findMany({ where: { kind: "REFUND", status: "SUCCEEDED", createdAt: { gte: since } }, select: { bookingId: true } })).map((r) => r.bookingId));
  const bookingFees = captures.filter((c) => !refundedIds.has(c.bookingId)).reduce((a, c) => a + (c.feeCents ?? 0), 0);
  const commission = payouts._sum.commissionCents ?? 0;
  const netRevenue = bookingFees + commission + subs;
  const byWho = (who: string) => cancels.filter((c) => (c.meta as { by?: string } | null)?.by === who).length;
  const hours = (ms: number) => (ms / 3600_000).toFixed(1);
  const avgResponse = responded.length ? responded.reduce((a, r) => a + (r.respondedAt!.getTime() - r.booking.createdAt.getTime()), 0) / responded.length : null;
  const avgResolution = resolved.length ? resolved.reduce((a, t) => a + (t.resolvedAt!.getTime() - t.createdAt.getTime()), 0) / resolved.length : null;

  const tiles: [string, string, string?][] = [
    ["Customers", String(customers)],
    ["Mates (approved / total)", `${approvedMates} / ${mates}`, `${verifiedMates} ID-verified`],
    ["New sign-ups", String(newUsers), `last ${days} days`],
    ["Bookings requested", String(totalBookings), `${paidBookings} paid · ${count("COMPLETED")} completed`],
    ["Booking conversion", totalBookings ? `${Math.round((paidBookings / totalBookings) * 100)}%` : "–", "requested → paid"],
    ["Mate acceptance rate", acceptRate == null ? "–" : `${Math.round(acceptRate * 100)}%`],
    ["Gross booking value", aud(captured), "captured payments"],
    ["Refunds", aud(refunds)],
    ["Membership revenue", aud(subs)],
    ["Mate payouts recorded", aud(payoutsOwed)],
    ["Repeat customers", String(repeatCustomers.length), "2+ completed bookings (all time)"],
    ["Open support tickets", String(openTickets)],
    ["Platform commission", aud(commission), "recorded on Mate payouts"],
    ["Customer booking fees", aud(bookingFees), "excl. refunded bookings"],
    ["Net platform revenue", aud(netRevenue), "fees + commission + membership"],
    ["Payment processing fees", "n/a", "available once Stripe is live"],
    ["Cancellations (customer / Mate)", `${byWho("customer")} / ${byWho("mate")}`],
    ["Avg Mate response time", avgResponse == null ? "–" : `${hours(avgResponse)} h`, "request → accept/decline"],
    ["Avg support resolution", avgResolution == null ? "–" : `${hours(avgResolution)} h`],
    ["Safety incidents", String(safetyReports + safetyTickets), `${safetyReports} reports · ${safetyTickets} safety tickets · ${disputes} disputes`],
  ];

  return (
    <>
      <PageHeader title="Overview & analytics" sub="Actual figures from bookings and the payments ledger. Payments are simulated in this build.">
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          {[7, 30, 90, 365].map((d) => <Link key={d} href={`/admin?days=${d}`} className={d === days ? "chip !bg-ocean !text-white" : "chip"}>{d === 365 ? "12 months" : `${d} days`}</Link>)}
          <span className="ml-auto flex gap-2">
            <a href={`/admin/export?type=bookings&days=${days}`} className="btn-ghost !py-1.5">Export bookings CSV</a>
            {can(staff, "finance.export") && <a href={`/admin/export?type=transactions&days=${days}`} className="btn-ghost !py-1.5">Export transactions CSV</a>}
          </span>
        </div>
      </PageHeader>
      <div className="mx-auto max-w-6xl space-y-8 px-4">
        {pendingMates > 0 && <Link href="/admin/mates" className="block rounded-xl bg-coral-100 p-3 text-sm text-coral-600">{pendingMates} Mate profile{pendingMates > 1 ? "s" : ""} waiting for review →</Link>}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map(([k, v, sub]) => (
            <div key={k} className="card p-4">
              <p className="text-xs text-muted">{k}</p>
              <p className="mt-1 text-2xl font-bold text-ocean tabular-nums">{v}</p>
              {sub && <p className="text-xs text-muted">{sub}</p>}
            </div>
          ))}
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="card p-5">
            <h2 className="h2">Bookings by status</h2>
            <ul className="mt-3 space-y-1 text-sm">{byStatus.sort((a, b) => b._count - a._count).map((b) => <li key={b.status} className="flex justify-between"><span>{STATUS_LABEL[b.status]}</span><span className="tabular-nums">{b._count}</span></li>)}</ul>
          </div>
          <div className="card p-5">
            <h2 className="h2">Demand by category</h2>
            <ul className="mt-3 space-y-1 text-sm">{[...catCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => <li key={c} className="flex justify-between"><span>{c}</span><span className="tabular-nums">{n}</span></li>)}</ul>
          </div>
        </section>

        {showSafety && <section>
          <h2 className="h2">Safety reports ({reports.length} open)</h2>
          {reports.length === 0 && <p className="mt-2 text-sm text-muted">No open reports.</p>}
          <ul className="mt-3 space-y-2">
            {reports.map((r) => (
              <li key={r.id} className="card p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p><span className="font-semibold text-ocean">{r.reason}</span> · from {r.reporter.displayName} ({r.reporter.role.toLowerCase()}) · {fmtDateTime(r.createdAt)}</p>
                  <span className="chip">{r.status.toLowerCase()}</span>
                </div>
                <p className="mt-1">{r.details}</p>
                <p className="mt-1 text-xs text-muted">{r.bookingId && <>Booking <a className="underline" href={`/bookings/${r.bookingId}`}>{r.bookingId}</a> </>}{r.mateId && <>· Mate <a className="underline" href={`/mates/${r.mateId}`}>{r.mateId}</a></>}</p>
                <div className="mt-2 flex gap-2">
                  {(["INVESTIGATING", "ACTIONED", "DISMISSED"] as const).map((s) => (
                    <form key={s} action={setReportStatus.bind(null, r.id, s)}><button className="btn-ghost !px-3 !py-1 text-xs">{s.toLowerCase()}</button></form>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>}
      </div>
    </>
  );
}
