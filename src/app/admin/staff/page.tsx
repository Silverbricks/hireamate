import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import { PERMISSIONS, ROLE_LABEL, ROLE_PERMISSIONS } from "@/lib/permissions";
import { createStaff, setStaffRole } from "@/app/admin-actions";
import StatefulForm from "@/components/StatefulForm";
import { PageHeader } from "@/components/ui";
import type { StaffRole } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

export default async function Staff() {
  const me = await requirePermission("staff.manage");
  const staff = await db.user.findMany({
    where: { role: "ADMIN" },
    orderBy: [{ status: "asc" }, { displayName: "asc" }],
    include: { sessions: { orderBy: { lastSeenAt: "desc" }, take: 1 } },
  });
  const roles = Object.keys(ROLE_LABEL) as StaffRole[];

  return (
    <>
      <PageHeader title="Staff & roles" sub="Role-based access (SRS v1.3 s4.3). Staff sign in with password plus a code to their mobile. All changes are audited." />
      <div className="mx-auto max-w-6xl space-y-8 px-4">
        <section className="overflow-x-auto">
          <table className="card w-full text-left text-sm">
            <thead className="text-ocean"><tr className="border-b border-ocean/10"><th className="p-3">Name</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Last active</th><th className="p-3">Change role</th></tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-b border-ocean/5 align-top">
                  <td className="p-3"><span className="font-semibold">{s.displayName}</span><span className="block text-xs text-muted">{s.email}</span></td>
                  <td className="p-3">{s.staffRole ? ROLE_LABEL[s.staffRole] : "-"}{s.staffRegion && <span className="block text-xs text-muted">Region: {s.staffRegion}</span>}</td>
                  <td className="p-3">{s.status.toLowerCase()}</td>
                  <td className="p-3 text-xs">{s.sessions[0] ? fmtDateTime(s.sessions[0].lastSeenAt) : "never"}</td>
                  <td className="p-3">
                    {s.id === me.id ? <span className="text-xs text-muted">You</span> : (
                      <details>
                        <summary className="cursor-pointer text-xs text-ocean underline">Change</summary>
                        <div className="mt-2 flex max-w-md flex-wrap gap-1">
                          {roles.map((r) => (
                            <form key={r} action={setStaffRole.bind(null, s.id, r)}><button className={s.staffRole === r && s.status === "ACTIVE" ? "chip !bg-ocean !text-white" : "chip"}>{ROLE_LABEL[r]}</button></form>
                          ))}
                          <form action={setStaffRole.bind(null, s.id, "DISABLED")}><button className="chip-coral">Disable account</button></form>
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card p-5">
          <h2 className="h2">Add staff member</h2>
          <StatefulForm action={createStaff} submitLabel="Add staff" className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <input name="displayName" className="input" placeholder="Display name" aria-label="Display name" required />
            <input name="legalName" className="input" placeholder="Legal name" aria-label="Legal name" required />
            <input name="email" type="email" className="input" placeholder="Work email" aria-label="Work email" required />
            <input name="mobile" className="input" placeholder="Mobile (for sign-in codes)" aria-label="Mobile" required />
            <select name="staffRole" className="input" aria-label="Role" defaultValue="CUSTOMER_SUPPORT">{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
            <select name="staffRegion" className="input" aria-label="Region" defaultValue=""><option value="">All regions</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select>
          </StatefulForm>
        </section>

        <section>
          <h2 className="h2">Permission matrix</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="card w-full text-left text-xs">
              <thead><tr className="border-b border-ocean/10"><th className="p-2">Permission</th>{roles.map((r) => <th key={r} className="p-2 [writing-mode:vertical-rl]">{ROLE_LABEL[r]}</th>)}</tr></thead>
              <tbody>
                {(Object.entries(PERMISSIONS) as [keyof typeof PERMISSIONS, string][]).map(([p, label]) => (
                  <tr key={p} className="border-b border-ocean/5">
                    <td className="p-2">{label}</td>
                    {roles.map((r) => <td key={r} className="p-2 text-center">{ROLE_PERMISSIONS[r].includes(p) ? "✓" : ""}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">Regional Managers currently see all regions; region scoping is a known limitation (ROADMAP.md).</p>
        </section>
      </div>
    </>
  );
}
