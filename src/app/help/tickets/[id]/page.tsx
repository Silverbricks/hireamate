import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import { replyTicket } from "@/app/account-actions";
import { updateTicket } from "@/app/admin-actions";
import StatefulForm from "@/components/StatefulForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUSES = ["IN_PROGRESS", "WAITING_CUSTOMER", "WAITING_MATE", "ESCALATED", "RESOLVED", "CLOSED"] as const;

export default async function Ticket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const admin = can(user, "support.manage");
  const t = await db.supportTicket.findUnique({
    where: { id },
    include: {
      requester: { select: { displayName: true, role: true } },
      assignee: { select: { displayName: true } },
      messages: { where: admin ? {} : { internal: false }, orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, displayName: true, role: true } } } },
    },
  });
  if (!t || (!admin && t.requesterId !== user.id)) notFound();
  if (admin && t.requesterId !== user.id && t.restricted && !can(user, "safety.manage")) notFound();

  return (
    <>
      <PageHeader title={`#${t.number} ${t.subject}`} sub={`${t.category} · ${t.status.toLowerCase().replace(/_/g, " ")} · ${t.priority.toLowerCase()} priority${t.assignee ? ` · assigned to ${t.assignee.displayName}` : ""}`} />
      <div className="mx-auto max-w-3xl space-y-4 px-4">
        {admin && (
          <div className="card flex flex-wrap gap-2 p-4 text-xs">
            <form action={updateTicket.bind(null, t.id, { assignToMe: true })}><button className="btn-ghost !px-3 !py-1">Assign to me</button></form>
            {STATUSES.map((s) => (
              <form key={s} action={updateTicket.bind(null, t.id, { status: s })}><button className={t.status === s ? "chip !bg-ocean !text-white" : "chip"}>{s.toLowerCase().replace(/_/g, " ")}</button></form>
            ))}
          </div>
        )}
        <ul className="space-y-2">
          {t.messages.map((m) => (
            <li key={m.id} className={`card p-4 text-sm ${m.internal ? "border-dashed bg-coral-100/40" : ""}`}>
              <p className="text-xs text-muted">{m.author.role === "ADMIN" ? "HIRE A MATE Support" : m.author.displayName} · {fmtDateTime(m.createdAt)}{m.internal && " · internal note"}</p>
              <p className="mt-1 whitespace-pre-line">{m.body}</p>
            </li>
          ))}
        </ul>
        {t.status !== "CLOSED" && (
          <StatefulForm action={replyTicket} submitLabel="Reply" className="card space-y-3 p-4">
            <input type="hidden" name="ticketId" value={t.id} />
            <textarea name="body" rows={3} className="input" placeholder="Write a reply…" required aria-label="Reply" />
            {admin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="internal" className="accent-ocean" /> Internal note (staff only)</label>}
          </StatefulForm>
        )}
      </div>
    </>
  );
}
