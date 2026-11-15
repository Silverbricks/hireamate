import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ROLE_LABEL, can } from "@/lib/permissions";
import { ADMIN_NAV } from "@/lib/admin-nav";


export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("ADMIN");
  return (
    <div>
      <nav className="border-b border-ocean/10 bg-white" aria-label="Admin">
        <div className="mx-auto flex max-w-6xl items-center gap-4 overflow-x-auto px-4 py-2 text-sm font-medium text-muted">
          {ADMIN_NAV.filter(([, , p]) => can(user, p)).map(([h, l]) => <Link key={h} href={h} className="whitespace-nowrap hover:text-ocean">{l}</Link>)}
          <span className="ml-auto whitespace-nowrap chip">{user.staffRole ? ROLE_LABEL[user.staffRole] : "No role assigned"}</span>
        </div>
      </nav>
      {children}
    </div>
  );
}
