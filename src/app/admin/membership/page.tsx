import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { aud } from "@/lib/pricing";
import { savePlan } from "@/app/admin-actions";
import StatefulForm from "@/components/StatefulForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminMembership() {
  await requirePermission("membership.manage");
  const [plans, subs, revenue] = await Promise.all([
    db.subscriptionPlan.findMany({ orderBy: [{ audience: "asc" }, { sortOrder: "asc" }] }),
    db.userSubscription.groupBy({ by: ["planId", "status"], _count: true }),
    db.paymentTransaction.aggregate({ where: { kind: "SUBSCRIPTION", status: "SUCCEEDED" }, _sum: { amountCents: true } }),
  ]);
  const count = (planId: string, status: string) => subs.find((s) => s.planId === planId && s.status === status)?._count ?? 0;

  return (
    <>
      <PageHeader title="Membership plans" sub={`Membership revenue to date: ${aud(revenue._sum.amountCents ?? 0)}. Limits are enforced server-side.`} />
      <div className="mx-auto grid max-w-6xl gap-4 px-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => (
          <StatefulForm key={p.id} action={savePlan} submitLabel="Save plan" resetOnOk={false} className="card space-y-2 p-5 text-sm">
            <p className="font-semibold text-ocean">{p.name} <span className="chip">{p.audience.toLowerCase()}</span></p>
            <p className="text-xs text-muted">{count(p.id, "ACTIVE")} active · {count(p.id, "TRIALING")} trialing · {count(p.id, "CANCELLED")} cancelled</p>
            <input type="hidden" name="id" value={p.id} />
            <div className="grid grid-cols-3 gap-2">
              <div><label className="label" htmlFor={`m-${p.id}`}>Monthly $</label><input id={`m-${p.id}`} name="monthly" type="number" step="0.01" min={0} defaultValue={p.monthlyCents / 100} className="input" /></div>
              <div><label className="label" htmlFor={`a-${p.id}`}>Annual $</label><input id={`a-${p.id}`} name="annual" type="number" step="0.01" min={0} defaultValue={p.annualCents / 100} className="input" /></div>
              <div><label className="label" htmlFor={`t-${p.id}`}>Trial days</label><input id={`t-${p.id}`} name="trialDays" type="number" min={0} defaultValue={p.trialDays} className="input" /></div>
            </div>
            <label className="label" htmlFor={`l-${p.id}`}>Limits (JSON)</label>
            <textarea id={`l-${p.id}`} name="limits" rows={3} defaultValue={JSON.stringify(p.limits)} className="input font-mono text-xs" />
            <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={p.active} className="accent-ocean" /> Available for sign-up</label>
          </StatefulForm>
        ))}
      </div>
      <p className="mx-auto mt-4 max-w-6xl px-4 text-xs text-muted">Coupons, promotional pricing, country pricing and automated renewals/retries arrive with the Stripe integration.</p>
    </>
  );
}
