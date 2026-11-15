import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { aud } from "@/lib/pricing";
import { fmtDate } from "@/lib/format";
import { currentPlan } from "@/server/membership";
import { cancelMembership, subscribe } from "@/app/account-actions";
import StatefulForm from "@/components/StatefulForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Membership() {
  const user = await requireUser();
  if (user.role === "ADMIN") return <PageHeader title="Membership" sub="Admins manage plans in Admin → Membership." />;
  const [plans, current, history] = await Promise.all([
    db.subscriptionPlan.findMany({ where: { audience: user.role, active: true }, orderBy: { sortOrder: "asc" } }),
    currentPlan(user),
    db.paymentTransaction.findMany({ where: { userId: user.id, kind: "SUBSCRIPTION" }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);

  return (
    <>
      <PageHeader
        title="Membership"
        sub={user.role === "CUSTOMER"
          ? "Membership is optional. Booking, messaging after acceptance and receiving gifts are free for everyone."
          : "Membership is optional. Every approved Mate receives booking requests. Plans never guarantee bookings or reviews."}
      >
        {current.subscription && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 text-sm shadow-sm">
            <span>Current: <strong className="text-ocean">{current.plan?.name}</strong> · {current.subscription.cancelAtPeriodEnd ? "ends" : "renews"} {fmtDate(current.subscription.currentPeriodEnd)}</span>
            {!current.subscription.cancelAtPeriodEnd && <form action={cancelMembership}><button className="btn-ghost !py-1.5">Cancel at period end</button></form>}
          </div>
        )}
      </PageHeader>
      <div className="mx-auto grid max-w-6xl gap-4 px-4 md:grid-cols-3">
        {plans.map((p) => {
          const isCurrent = current.plan?.id === p.id;
          return (
            <div key={p.id} className={`card flex flex-col p-6 ${isCurrent ? "ring-2 ring-coral" : ""}`}>
              <p className="font-bold text-ocean">{p.name}</p>
              <p className="mt-1 text-3xl font-extrabold text-ocean">{p.monthlyCents ? aud(p.monthlyCents) : "Free"}<span className="text-sm font-normal text-muted">{p.monthlyCents ? " / month" : ""}</span></p>
              {p.annualCents > 0 && <p className="text-xs text-muted">or {aud(p.annualCents)} / year</p>}
              <p className="mt-2 text-sm text-muted">{p.description}</p>
              <ul className="mt-3 flex-1 space-y-1 text-sm">{p.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
              {isCurrent ? (
                <p className="mt-4 chip-coral justify-center">Your plan</p>
              ) : (
                <StatefulForm action={subscribe} submitLabel={p.monthlyCents ? `Choose ${p.name}` : "Switch to free"} resetOnOk={false} className="mt-4 space-y-2">
                  <input type="hidden" name="planId" value={p.id} />
                  {p.monthlyCents > 0 && (
                    <select name="interval" className="input" aria-label="Billing interval">
                      <option value="MONTHLY">Monthly</option>
                      <option value="ANNUAL">Annual</option>
                    </select>
                  )}
                </StatefulForm>
              )}
            </div>
          );
        })}
      </div>
      <div className="mx-auto mt-6 max-w-6xl px-4 text-sm">
        <p className="text-xs text-muted">Prices in AUD incl. GST, proposed and subject to commercial review. Payments are simulated in this build.</p>
        {history.length > 0 && (
          <div className="card mt-4 p-5">
            <p className="font-semibold text-ocean">Membership history</p>
            <ul className="mt-2 space-y-1">{history.map((t) => <li key={t.id} className="flex justify-between"><span>{fmtDate(t.createdAt)} · {t.description}</span><span>{aud(t.amountCents)} · {t.status.toLowerCase()}</span></li>)}</ul>
          </div>
        )}
      </div>
    </>
  );
}
