import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { fmtDate } from "@/lib/format";
import { createTicket } from "@/app/account-actions";
import StatefulForm from "@/components/StatefulForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const FAQ: [string, string][] = [
  ["When am I charged?", "After a Mate accepts your request. You'll get a notification to pay, and the booking is confirmed once payment succeeds."],
  ["Can I cancel?", "Yes. Unpaid requests can be cancelled any time. Paid bookings cancelled more than 24 hours before the start are refunded in full; later cancellations are reviewed under the cancellation policy."],
  ["Is HIRE A MATE a dating service?", "No. It's a platonic companionship, activity and everyday-help platform. Sexual or intimate services are strictly prohibited."],
  ["Where does my Mate meet me?", "At the meeting point you set. For household help, your address is only shared with the Mate after they accept."],
  ["Do I need a paid membership?", "No. Free members can browse, book, message after acceptance and receive gifts. Paid plans add higher limits and extras."],
  ["How do Mates get verified?", "Mates verify their email and mobile and are reviewed by our team before appearing in search. ID verification is being added before launch."],
];

// SRS v1.3 s19.1. Safety categories are escalated, urgent and restricted to safety staff.
const CATEGORIES = ["Booking", "Payments", "Refunds", "Membership", "Account", "Verification", "Mate complaint", "Customer complaint", "Safety incident", "Inappropriate request", "Harassment", "Fraud", "Technical issue", "Appeal a decision"];

export default async function Help() {
  const user = await currentUser();
  const tickets = user ? await db.supportTicket.findMany({ where: { requesterId: user.id }, orderBy: { updatedAt: "desc" } }) : [];

  return (
    <>
      <PageHeader title="Help & support" sub="Answers to common questions, or contact our team." />
      <div className="mx-auto grid max-w-6xl gap-6 px-4 lg:grid-cols-[1fr_400px]">
        <section className="space-y-2">
          {FAQ.map(([q, a]) => (
            <details key={q} className="card p-4">
              <summary className="cursor-pointer font-semibold text-ocean">{q}</summary>
              <p className="mt-2 text-sm">{a}</p>
            </details>
          ))}
          <div className="rounded-2xl bg-ocean p-5 text-white">
            <p className="font-semibold">Urgent safety issue?</p>
            <p className="text-sm text-ocean-100">If anyone is in immediate danger call <strong className="text-white">000</strong>. Safety tickets are escalated to our safety team straight away.</p>
          </div>
        </section>
        <aside className="space-y-4">
          {user ? (
            <>
              <div className="card p-5">
                <p className="font-semibold text-ocean">Contact support</p>
                <StatefulForm action={createTicket} submitLabel="Create ticket" className="mt-3 space-y-3">
                  <select name="category" className="input" defaultValue="" required aria-label="Category">
                    <option value="" disabled>Choose a topic</option>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <input name="subject" className="input" placeholder="Subject" required aria-label="Subject" />
                  <textarea name="body" rows={4} className="input" placeholder="How can we help? Include booking dates if relevant." required aria-label="Details" />
                </StatefulForm>
              </div>
              {tickets.length > 0 && (
                <div className="card p-5 text-sm">
                  <p className="font-semibold text-ocean">My tickets</p>
                  <ul className="mt-2 space-y-1">
                    {tickets.map((t) => (
                      <li key={t.id}><Link href={`/help/tickets/${t.id}`} className="flex justify-between hover:underline"><span>#{t.number} {t.subject}</span><span className="chip">{t.status.toLowerCase().replace("_", " ")}</span></Link><span className="text-xs text-muted">{fmtDate(t.updatedAt)}</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="card p-5 text-sm"><Link href="/signin" className="text-ocean underline">Sign in</Link> to contact support or track tickets.</div>
          )}
        </aside>
      </div>
    </>
  );
}
