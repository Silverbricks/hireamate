import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import { CATEGORIES } from "@/server/comms/events";
import { archiveNotification, markAllRead, openNotification } from "@/app/account-actions";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Notifications({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await requireUser();
  const { filter } = await searchParams;
  const where = {
    userId: user.id,
    archived: false,
    ...(filter === "unread" ? { readAt: null } : filter && filter in CATEGORIES ? { category: filter } : {}),
  };
  const items = await db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
  const tabs: [string | undefined, string][] = [[undefined, "All"], ["unread", "Unread"], ["BOOKING", "Bookings"], ["MESSAGE", "Messages"], ["PAYMENT", "Payments"], ["MEMBERSHIP", "Membership"], ["SECURITY", "Account & safety"]];

  return (
    <>
      <PageHeader title="Notifications">
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {tabs.map(([k, l]) => (
            <Link key={l} href={k ? `/notifications?filter=${k}` : "/notifications"} className={filter === k ? "chip !bg-ocean !text-white" : "chip"}>{l}</Link>
          ))}
          <form action={markAllRead} className="ml-auto"><button className="btn-ghost !py-1.5">Mark all as read</button></form>
          <Link href="/account#notifications" className="text-sm text-ocean underline">Preferences</Link>
        </div>
      </PageHeader>
      <ul className="mx-auto max-w-4xl space-y-2 px-4">
        {items.length === 0 && <li className="card p-6 text-center text-muted">You&apos;re all caught up.</li>}
        {items.map((n) => (
          <li key={n.id} className={`card flex items-center gap-3 p-4 ${n.readAt ? "" : "border-l-4 border-l-coral"}`}>
            <form action={openNotification.bind(null, n.id)} className="flex-1">
              <button className="w-full text-left">
                <p className={n.readAt ? "text-sm" : "text-sm font-semibold text-ocean"}>{n.title}</p>
                <p className="text-xs text-muted">{CATEGORIES[n.category as keyof typeof CATEGORIES]?.label ?? n.category} · {fmtDateTime(n.createdAt)}</p>
              </button>
            </form>
            <form action={archiveNotification.bind(null, n.id)}><button className="text-xs text-muted hover:text-ocean" aria-label="Archive">Archive</button></form>
          </li>
        ))}
      </ul>
    </>
  );
}
