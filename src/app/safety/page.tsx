import { db } from "@/lib/db";
import { POLICY_SUMMARY } from "@/lib/policy";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Safety() {
  const restricted = await db.restrictedTask.findMany({ orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Safety & community policy" sub="HIRE A MATE is a platonic companionship, activity and everyday-help platform. Clear boundaries keep everyone safe." />
      <div className="mx-auto grid max-w-6xl gap-6 px-4 md:grid-cols-2">
        <section className="card p-6">
          <h2 className="h2">Strictly non-sexual, non-intimate</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">{POLICY_SUMMARY.map((p) => <li key={p}>{p}</li>)}</ul>
          <p className="mt-3 text-sm">
            Prohibited: sexual services or favours, paid intimacy, escort-style arrangements, requests for nudity or sexual content,
            unwanted touching, coercion or harassment, and asking someone to pretend a paid booking is a romantic relationship.
            Requests like these are blocked automatically and reviewed by our safety team. Accounts may be suspended.
          </p>
        </section>
        <section className="card p-6">
          <h2 className="h2">How we keep bookings safe</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
            <li>Mates complete ID verification before being shown as verified.</li>
            <li>Messaging stays on the platform and opens only once a booking is accepted. Gifts never unlock chat.</li>
            <li>Home addresses are shared with a Mate only after they accept.</li>
            <li>Every booking shows the activity, times, location, price and expenses before you confirm.</li>
            <li>Either person can decline, cancel or report at any time. Mates are never penalised for declining.</li>
            <li>First meetings are encouraged in public places.</li>
            <li>Overnight and interstate travel need explicit extra agreement and can be restricted by region.</li>
          </ul>
        </section>
        <section className="card p-6 md:col-span-2">
          <h2 className="h2">Services we don&apos;t provide</h2>
          <p className="mt-1 text-sm text-muted">HIRE A MATE is not a dating, escort, counselling, medical, NDIS, aged-care or trade service.</p>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {restricted.map((r) => <li key={r.id} className="rounded-xl bg-ivory p-3"><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{r.reason}</p></li>)}
          </ul>
        </section>
        <section className="rounded-2xl bg-ocean p-6 text-white md:col-span-2">
          <h2 className="text-xl font-bold">Need help now?</h2>
          <p className="mt-1 text-ocean-100">Emergency: call <strong className="text-white">000</strong>. For support with how you&apos;re feeling, Lifeline is available 24/7 on <strong className="text-white">13 11 14</strong>. HIRE A MATE is not a crisis service.</p>
        </section>
      </div>
    </>
  );
}
