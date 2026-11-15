import Link from "next/link";
import { requireUser } from "@/lib/session";
import { PERMISSIONS, can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { ADMIN_NAV } from "@/lib/admin-nav";

export default async function Forbidden({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const user = await requireUser("ADMIN");
  const need = (await searchParams).need as keyof typeof PERMISSIONS | undefined;
  const allowed = ADMIN_NAV.filter(([, , p]) => can(user, p));
  return (
    <>
      <PageHeader title="You don't have access to that" sub={need && PERMISSIONS[need] ? `Requires permission: ${PERMISSIONS[need]}. Ask a Super Admin if you need it.` : "Ask a Super Admin if you need access."} />
      <div className="mx-auto max-w-6xl px-4">
        {allowed.length ? (
          <div className="flex flex-wrap gap-2">{allowed.map(([h, l]) => <Link key={h} href={h} className="btn-ghost">{l}</Link>)}</div>
        ) : (
          <p className="text-muted">Your staff account has no role yet.</p>
        )}
      </div>
    </>
  );
}
