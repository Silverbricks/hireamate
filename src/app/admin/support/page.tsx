import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const PRIORITY_ORDER = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const staff = await requirePermission("support.manage");
  const all = (await searchParams).all === "1";
  const tickets = await db.supportTicket.findMany({
    where: {
      ...(all ? {} : { status: { notIn: ["RESOLVED", "CLOSED"] } }),
      ...(can(staff, "safety.manage") ? {} : { restricted: false }), // s19.2 restricted access
    },
    include: { requester: { select: { displayName: true, role: true } }, assignee: { select: { displayName: true } }, _count: { select: { messages: true } } },
    orderBy: { updatedAt: "desc" },
  });
  tickets.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  return (
    <>
      <PageHeader title="Support tickets" sub="Safety tickets are escalated, marked urgent and visible only to safety staff.">
        <div className="mt-3 flex gap-2 text-sm">
          <Link href="/admin/support" className={all ? "chip" : "chip !bg-ocean !text-white"}>Open</Link>
          <Link href="/admin/support?all=1" className={all ? "chip !bg-ocean !text-white" : "chip"}>All</Link>
        </div>
      </PageHeader>
      <ul className="mx-auto max-w-6xl space-y-2 px-4">
        {tickets.length === 0 && <li className="card p-6 text-center text-muted">No tickets.</li>}
        {tickets.map((t) => (
          <li key={t.id}>
            <Link href={`/help/tickets/${t.id}`} className={`card flex flex-wrap items-center gap-3 p-4 text-sm hover:shadow-md ${t.priority === "URGENT" ? "border-l-4 border-l-coral" : ""}`}>
              <span className="font-semibold text-ocean">#{t.number} {t.subject}</span>
              <span className="text-muted">{t.category} · {t.requester.displayName} ({t.requester.role.toLowerCase()}) · {t._count.messages} messages · updated {fmtDateTime(t.updatedAt)}</span>
              <span className="ml-auto flex gap-1">
                <span className={t.priority === "URGENT" ? "chip-coral" : "chip"}>{t.priority.toLowerCase()}</span>
                <span className="chip">{t.status.toLowerCase().replace(/_/g, " ")}</span>
                {t.assignee && <span className="chip">@{t.assignee.displayName}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
