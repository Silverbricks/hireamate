import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePermission("audit.view");
  const q = (await searchParams).q?.trim();
  const logs = await db.auditLog.findMany({
    where: q ? { OR: [{ action: { contains: q } }, { entity: { contains: q } }, { entityId: q }, { actorId: q }] } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const actors = await db.user.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.actorId).filter(Boolean) as string[])] } }, select: { id: true, displayName: true, role: true } });
  const who = (id: string | null) => {
    const a = actors.find((x) => x.id === id);
    return a ? `${a.displayName} (${a.role.toLowerCase()})` : "system";
  };

  return (
    <>
      <PageHeader title="Audit log" sub="Append-only record of sign-ins, payments, bookings and admin changes.">
        <form className="mt-3 flex max-w-md gap-2">
          <input name="q" defaultValue={q} className="input" placeholder="Filter by action, entity or ID" aria-label="Filter" />
          <button className="btn-ocean">Filter</button>
        </form>
      </PageHeader>
      <div className="mx-auto max-w-6xl overflow-x-auto px-4">
        <table className="card w-full text-left text-xs">
          <thead className="text-ocean"><tr className="border-b border-ocean/10"><th className="p-2">When</th><th className="p-2">Actor</th><th className="p-2">Action</th><th className="p-2">Entity</th><th className="p-2">Details</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-ocean/5 align-top">
                <td className="p-2 whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
                <td className="p-2">{who(l.actorId)}</td>
                <td className="p-2 font-medium">{l.action}</td>
                <td className="p-2">{l.entity}{l.entityId && <span className="block text-muted">{l.entityId}</span>}</td>
                <td className="p-2 font-mono text-[11px] text-muted">{l.meta ? JSON.stringify(l.meta) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
