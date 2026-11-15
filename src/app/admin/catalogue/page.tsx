import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { addRestrictedTask, createCategory, moveCategory, toggleCategory, toggleNeed, toggleService } from "@/app/admin-actions";
import StatefulForm from "@/components/StatefulForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminCatalogue() {
  await requirePermission("catalogue.manage");
  const [categories, needs, restricted] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: "asc" }, include: { services: { orderBy: { name: "asc" } }, parent: true } }),
    db.need.findMany({ orderBy: { sortOrder: "asc" } }),
    db.restrictedTask.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader title="Services & catalogue" sub="Categories, services, homepage choices and the restricted task register." />
      <div className="mx-auto max-w-6xl space-y-10 px-4">
        <section>
          <h2 className="h2">Service categories</h2>
          <p className="text-sm text-muted">Order, activate and deactivate categories and services. Deactivated items disappear from search, the homepage and booking.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="card w-full text-sm">
              <thead className="text-left text-ocean">
                <tr className="border-b border-ocean/10"><th className="p-3">Category</th><th className="p-3">Type</th><th className="p-3">Services</th><th className="p-3">Status</th><th className="p-3">Order</th></tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-b border-ocean/5 align-top">
                    <td className="p-3">
                      <p className="font-semibold">{c.parent ? "↳ " : ""}{c.emoji} {c.name}</p>
                      {c.parent && <p className="text-xs text-muted">under {c.parent.name}</p>}
                    </td>
                    <td className="p-3">{c.kind.toLowerCase()}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {c.services.map((s) => (
                          <form key={s.id} action={toggleService.bind(null, s.id)}>
                            <button title="Toggle service" className={s.active ? "chip" : "chip line-through opacity-50"}>{s.name}</button>
                          </form>
                        ))}
                      </div>
                    </td>
                    <td className="p-3">
                      <form action={toggleCategory.bind(null, c.id)}><button className={c.active ? "chip" : "chip-coral"}>{c.active ? "Active" : "Inactive"}</button></form>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <form action={moveCategory.bind(null, c.id, -1)}><button className="btn-ghost !px-2 !py-1" aria-label="Move up">↑</button></form>
                        <form action={moveCategory.bind(null, c.id, 1)}><button className="btn-ghost !px-2 !py-1" aria-label="Move down">↓</button></form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card mt-4 p-4">
            <p className="font-semibold text-ocean">Add a category or subcategory</p>
            <StatefulForm action={createCategory} submitLabel="Create" className="mt-2 grid gap-2 sm:grid-cols-6">
              <input name="emoji" placeholder="Emoji" className="input sm:col-span-1" />
              <input name="name" placeholder="Name" className="input sm:col-span-2" required />
              <input name="description" placeholder="Short description" className="input sm:col-span-3" />
              <select name="kind" className="input sm:col-span-2"><option value="COMPANION">Companion</option><option value="HOUSEHOLD">Household</option></select>
              <select name="parentId" className="input sm:col-span-4" defaultValue="">
                <option value="">Top-level</option>
                {categories.filter((c) => !c.parentId).map((c) => <option key={c.id} value={c.id}>Subcategory of {c.name}</option>)}
              </select>
            </StatefulForm>
          </div>
        </section>

        <section>
          <h2 className="h2">&ldquo;What do you need today?&rdquo; choices</h2>
          <p className="text-sm text-muted">Customers&apos; choices are never stored. These only map a label to categories.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {needs.map((n) => (
              <li key={n.id} className="card flex items-center justify-between gap-2 p-3 text-sm">
                <span><span className="font-medium">{n.label}</span><span className="block text-xs text-muted">{n.categorySlugs.join(", ")}</span></span>
                <form action={toggleNeed.bind(null, n.id)}><button className={n.active ? "chip" : "chip-coral"}>{n.active ? "Shown" : "Hidden"}</button></form>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="h2">Restricted task register</h2>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {restricted.map((r) => (
              <li key={r.id} className="card p-3"><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{r.reason}</p></li>
            ))}
          </ul>
          <StatefulForm action={addRestrictedTask} submitLabel="Add / update" className="card mt-3 grid gap-2 p-4 sm:grid-cols-[1fr_2fr_auto]">
            <input name="name" placeholder="Task" className="input" required />
            <input name="reason" placeholder="Reason" className="input" required />
          </StatefulForm>
        </section>
      </div>
    </>
  );
}
