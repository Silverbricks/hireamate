import { fmtDateTime, fmtTime } from "@/lib/format";
import { getSettings } from "@/server/settings";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { aud, mateNetCents } from "@/lib/pricing";
import { CHAT_OPEN, MATE_PROGRESS, STATUS_LABEL } from "@/lib/status";
import { advanceBooking, blockUser, cancelBooking, confirmCompletion, payBooking, raiseSos, respondToBooking, sendMessage, submitReport, submitReview } from "@/app/actions";
import PaymentPanel from "@/components/PaymentPanel";
import StatefulForm from "@/components/StatefulForm";
import ReportFields from "@/components/ReportFields";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";

const PROGRESS_LABEL: Record<string, string> = {
  CONFIRMED: "I'm on my way", MATE_ON_WAY: "Check in", CHECKED_IN: "Start activity",
};

export default async function BookingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string; error?: string; sos?: string }> }) {
  const { id } = await params;
  const { new: isNew, error, sos } = await searchParams;
  const { pricing, booking: rules } = await getSettings();
  const user = await requireUser();
  const b = await db.booking.findUnique({
    where: { id },
    include: {
      service: { include: { category: true } },
      taskItems: { include: { service: true } },
      customer: { select: { id: true, displayName: true } },
      mates: { include: { mate: { select: { id: true, displayName: true, avatarHue: true, userId: true } } } },
      messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { displayName: true, id: true } } } },
      reviews: true,
      payments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!b) notFound();
  const isCustomer = b.customerId === user.id;
  const myLine = b.mates.find((m) => m.mate.userId === user.id);
  if (!isCustomer && !myLine && !can(user, "bookings.view")) notFound(); // never reveal other people's bookings

  const accepted = b.mates.filter((m) => m.response === "ACCEPTED");
  const chatOpen = CHAT_OPEN.includes(b.status) && (isCustomer || myLine?.response === "ACCEPTED");
  // The service address is only shared with Mates once they accept.
  const showAddress = isCustomer || myLine?.response === "ACCEPTED" || b.service.category.kind !== "HOUSEHOLD";
  const hours = (b.endsAt.getTime() - b.startsAt.getTime()) / 3600_000;
  const cancellable = ["PENDING_MATE_ACCEPTANCE", "PARTIALLY_ACCEPTED", "PENDING_PAYMENT", "CONFIRMED"].includes(b.status);
  const awaitingPayment = isCustomer && !b.paidAt && (b.status === "PENDING_PAYMENT" || (b.status === "PARTIALLY_ACCEPTED" && accepted.length > 0));
  const acceptedSubtotal = accepted.reduce((a, m) => a + m.amountCents, 0);
  const payFee = Math.round(acceptedSubtotal * pricing.customerFeeRate);
  const payTotal = acceptedSubtotal + b.travelFeeCents + payFee;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {isNew && (
        <div className="mb-6 rounded-2xl bg-ocean p-4 text-white">
          <p className="font-semibold">Request sent.</p>
          <p className="text-sm text-ocean-100">Nothing has been charged. We&apos;ll notify you when {b.mates.map((m) => m.mate.displayName).join(", ")} accepts. Then you pay to confirm, and messaging opens.</p>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{b.service.category.emoji} {b.service.category.name}</p>
          <h1 className="h1">{b.service.name}{b.isFreeMeet && <span className="ml-2 align-middle chip-coral">Free first meet</span>}</h1>
          <p className="text-muted">{fmtDateTime(b.startsAt, "long")} · {hours} hr</p>
        </div>
        <span className="chip text-sm">{STATUS_LABEL[b.status]}</span>
      </div>

      {sos && (
        <div role="alert" className="mb-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">Safety alert sent to the HIRE A MATE safety team.</p>
          <p>If you or anyone else is in immediate danger, call <strong>000</strong> now. HIRE A MATE is not an emergency service.</p>
        </div>
      )}
      {error === "conflict" && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">You already have an accepted booking that overlaps this time, so it can&apos;t be accepted.</p>}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {awaitingPayment && (
            <PaymentPanel
              action={payBooking}
              bookingId={b.id}
              lines={[
                ...accepted.map((m) => ({ label: `${m.mate.displayName}: ${hours} hr`, cents: m.amountCents })),
                ...(b.travelFeeCents ? [{ label: `Travel charge${b.distanceKm != null ? ` (${b.distanceKm} km)` : ""}`, cents: b.travelFeeCents }] : []),
                { label: `Booking fee (${Math.round(pricing.customerFeeRate * 100)}%)`, cents: payFee },
              ]}
              totalCents={payTotal}
              partial={b.mates.some((m) => m.response === "PENDING")}
              freeCancellationHours={rules.freeCancellationHours}
            />
          )}
          <section className="card p-5">
            <h2 className="h2">Details</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <Item k={b.service.category.kind === "HOUSEHOLD" ? "Service address" : "Meeting point"} v={showAddress ? b.meetingPoint : "Shared after you accept"} />
              <Item k="People attending" v={String(b.participants)} />
              <Item k="Repeats" v={b.recurrence === "ONE_TIME" ? "No" : b.recurrence.toLowerCase()} />
              <Item k="Expenses" v={b.expensesNote ?? "None noted"} />
              {b.expenseLimitCents != null && <Item k="Authorised shopping spend" v={`${aud(b.expenseLimitCents)} (reimbursed against receipts)`} />}
              {b.accessibility && <Item k="Accessibility" v={b.accessibility} />}
            </dl>
            <p className="mt-3 rounded-xl bg-ivory p-3 text-sm">{b.description}</p>
            {b.taskItems.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-ocean">Tasks</p>
                <ul className="mt-1 flex flex-wrap gap-1.5">{b.taskItems.map((t) => <li key={t.id} className="chip">{t.service.name} · ~{t.estMins} min</li>)}</ul>
              </div>
            )}
          </section>

          <section className="card p-5">
            <h2 className="h2">Messages</h2>
            {!chatOpen ? (
              <p className="mt-2 text-sm text-muted">Messaging opens once a Mate accepts. Keep contact details on the platform until you both agree to share them.</p>
            ) : (
              <>
                <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                  {b.messages.length === 0 && <li className="text-sm text-muted">No messages yet. Say hello and confirm the plan.</li>}
                  {b.messages.map((m) => (
                    <li key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.sender.id === user.id ? "ml-auto bg-ocean text-white" : "bg-ivory"}`}>
                      <p className="text-xs opacity-70">{m.sender.displayName} · {fmtTime(m.createdAt)}</p>
                      {m.body}
                    </li>
                  ))}
                </ul>
                <StatefulForm action={sendMessage} submitLabel="Send" className="mt-3 flex flex-wrap items-start gap-2">
                  <input type="hidden" name="bookingId" value={b.id} />
                  <input name="body" className="input flex-1" placeholder="Write a message…" maxLength={1000} required />
                </StatefulForm>
              </>
            )}
          </section>

          {isCustomer && b.status === "COMPLETED" && accepted.map((m) => {
            const done = b.reviews.find((r) => r.mateId === m.mateId);
            return (
              <section key={m.id} className="card p-5">
                <h2 className="h2">Review {m.mate.displayName}</h2>
                {done ? (
                  <p className="mt-2 text-sm">You rated {"★".repeat(done.rating)}: &ldquo;{done.comment}&rdquo;</p>
                ) : (
                  <StatefulForm action={submitReview} submitLabel="Post review" className="mt-3 space-y-3">
                    <input type="hidden" name="bookingId" value={b.id} />
                    <input type="hidden" name="mateId" value={m.mateId} />
                    <select name="rating" className="input" defaultValue="5">{[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{"★".repeat(r)} ({r})</option>)}</select>
                    <textarea name="comment" rows={3} className="input" placeholder="How was the experience?" required />
                  </StatefulForm>
                )}
              </section>
            );
          })}

          {(isCustomer || myLine?.response === "ACCEPTED") && ["CONFIRMED", "MATE_ON_WAY", "CHECKED_IN", "IN_PROGRESS"].includes(b.status) && (
            <section className="card border-2 border-red-200 p-5 text-sm">
              <h2 className="h2">Safety</h2>
              <p className="mt-1">In an emergency, call <strong>000</strong>. HIRE A MATE is not an emergency service.</p>
              <p className="mt-1 text-muted">Feeling unsafe or uncomfortable? Leave, then alert our safety team. We&apos;ll also text your emergency contact if you&apos;ve added one in Account settings.</p>
              <form action={raiseSos.bind(null, b.id)} className="mt-3"><button className="btn bg-red-600 text-white hover:bg-red-700">Alert the safety team (SOS)</button></form>
            </section>
          )}

          <details className="card p-5">
            <summary className="cursor-pointer font-semibold text-ocean">Report a problem with this booking</summary>
            <StatefulForm action={submitReport} submitLabel="Send report" className="mt-3 space-y-3">
              <ReportFields bookingId={b.id} />
            </StatefulForm>
            <p className="mt-2 text-xs text-muted">If anyone is in immediate danger, call 000.</p>
            {(isCustomer || myLine) && (
              <form action={blockUser.bind(null, isCustomer ? (accepted[0]?.mate.userId ?? b.mates[0].mate.userId) : b.customerId, "/")} className="mt-3">
                <button className="text-xs text-muted underline">Block {isCustomer ? b.mates.map((m) => m.mate.displayName).join(", ") : b.customer.displayName}</button>
              </form>
            )}
          </details>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <p className="font-semibold text-ocean">{isCustomer ? "Your Mates" : `Customer: ${b.customer.displayName}`}</p>
            <ul className="mt-3 space-y-3">
              {b.mates.map((m) => (
                <li key={m.id} className="flex items-center gap-3 text-sm">
                  <Avatar name={m.mate.displayName} hue={m.mate.avatarHue} size={36} />
                  <Link href={`/mates/${m.mate.id}`} className="flex-1 font-medium hover:underline">{m.mate.displayName}</Link>
                  <span className="chip">{m.response.toLowerCase()}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-5 text-sm">
            {isCustomer ? (
              <>
                <Row k="Subtotal" v={aud(b.subtotalCents)} />
                {b.travelFeeCents > 0 && <Row k="Travel charge" v={aud(b.travelFeeCents)} />}
                <Row k="Booking fee" v={aud(b.customerFeeCents)} />
                <Row k={b.paidAt ? "Total paid" : "Total (pay after acceptance)"} v={aud(b.totalCents)} bold />
                {b.payments.length > 0 && (
                  <ul className="mt-3 space-y-0.5 border-t border-ocean/10 pt-2 text-xs text-muted">
                    {b.payments.filter((t) => t.kind !== "MATE_PAYOUT").map((t) => <li key={t.id}>{t.kind === "REFUND" ? "Refund" : "Payment"} {aud(t.amountCents)} · {t.status.toLowerCase()} · {fmtDateTime(t.createdAt)}</li>)}
                  </ul>
                )}
              </>
            ) : myLine ? (
              (() => {
                const n = mateNetCents(myLine.amountCents, pricing.mateCommissionRate);
                return (
                  <>
                    <Row k="Your booking amount" v={aud(n.gross)} />
                    <Row k="Platform commission" v={`−${aud(n.commission)}`} />
                    <Row k="Your payout" v={aud(n.net)} bold />
                  </>
                );
              })()
            ) : null}
          </div>

          <div className="card space-y-2 p-5">
            {myLine?.response === "PENDING" && (
              <div className="flex gap-2">
                <form action={respondToBooking.bind(null, b.id, true)} className="flex-1"><button className="btn-ocean w-full">Accept</button></form>
                <form action={respondToBooking.bind(null, b.id, false)} className="flex-1"><button className="btn-ghost w-full">Decline</button></form>
              </div>
            )}
            {myLine?.response === "ACCEPTED" && MATE_PROGRESS[b.status] && (
              <form action={advanceBooking.bind(null, b.id)}><button className="btn-ocean w-full">{PROGRESS_LABEL[b.status]}</button></form>
            )}
            {isCustomer && ["IN_PROGRESS", "CHECKED_IN"].includes(b.status) && (
              <form action={confirmCompletion.bind(null, b.id)}><button className="btn-primary w-full">Confirm it&apos;s complete</button></form>
            )}
            {cancellable && (isCustomer || myLine?.response === "ACCEPTED") && (
              <form action={cancelBooking.bind(null, b.id)}><button className="btn-ghost w-full">{isCustomer ? "Cancel booking" : "Withdraw"}</button></form>
            )}
            {isCustomer && cancellable && <p className="text-xs text-muted">{b.paidAt ? `Full refund if cancelled more than ${rules.freeCancellationHours} hours before the start. Later cancellations are reviewed under the cancellation policy.` : "Nothing has been charged yet."}</p>}
            {myLine && <p className="text-xs text-muted">Declining never affects your ranking.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (<div><dt className="font-medium text-ocean">{k}</dt><dd>{v}</dd></div>);
}
function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (<div className={`flex justify-between py-0.5 ${bold ? "mt-1 border-t border-ocean/10 pt-2 font-bold text-ocean" : ""}`}><span>{k}</span><span>{v}</span></div>);
}
