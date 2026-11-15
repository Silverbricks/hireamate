import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { devFeaturesEnabled } from "@/server/env";
import { fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Development only: shows messages "sent" by the console email/SMS providers so codes can be used locally. */
export default async function DevInbox() {
  if (!devFeaturesEnabled()) notFound();
  const logs = await db.deliveryLog.findMany({ where: { provider: "console" }, orderBy: { createdAt: "desc" }, take: 50 });
  return (
    <>
      <PageHeader title="Dev inbox" sub="Email and SMS captured by the console provider. Never available in production." />
      <ul className="mx-auto max-w-4xl space-y-2 px-4">
        {logs.map((l) => (
          <li key={l.id} className="card p-4 text-sm" data-testid="dev-message">
            <p className="text-xs text-muted">{l.channel} · to {l.to} · {l.event} · {fmtDateTime(l.createdAt)}</p>
            {l.subject && <p className="font-semibold text-ocean">{l.subject}</p>}
            <p className="whitespace-pre-line">{l.body}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
