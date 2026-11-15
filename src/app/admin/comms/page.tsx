import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import { retryFailedDelivery, saveTemplate } from "@/app/admin-actions";
import StatefulForm from "@/components/StatefulForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminComms({ searchParams }: { searchParams: Promise<{ status?: string; channel?: string }> }) {
  await requirePermission("comms.manage");
  const sp = await searchParams;
  const [templates, logs, stats] = await Promise.all([
    db.messageTemplate.findMany({ orderBy: [{ event: "asc" }, { channel: "asc" }] }),
    db.deliveryLog.findMany({
      where: { ...(sp.status ? { status: sp.status as "FAILED" } : {}), ...(sp.channel ? { channel: sp.channel as "EMAIL" } : {}) },
      orderBy: { createdAt: "desc" }, take: 100,
    }),
    db.deliveryLog.groupBy({ by: ["channel", "status"], _count: true }),
  ]);
  const stat = (ch: string, st: string) => stats.find((s) => s.channel === ch && s.status === st)?._count ?? 0;

  return (
    <>
      <PageHeader title="Communications" sub="Email and SMS templates, and the delivery log for every message sent." />
      <div className="mx-auto max-w-6xl space-y-8 px-4">
        <section className="grid gap-3 sm:grid-cols-3">
          {["EMAIL", "SMS", "PUSH"].map((ch) => (
            <div key={ch} className="card p-4 text-sm">
              <p className="font-semibold text-ocean">{ch}</p>
              <p className="tabular-nums">{stat(ch, "SENT")} sent · <span className={stat(ch, "FAILED") ? "text-coral-600" : ""}>{stat(ch, "FAILED")} failed</span></p>
            </div>
          ))}
        </section>

        <section>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="h2 mr-auto">Delivery log</h2>
            {[["", "All"], ["FAILED", "Failed"], ["SENT", "Sent"]].map(([v, l]) => <Link key={l} href={v ? `/admin/comms?status=${v}` : "/admin/comms"} className={(sp.status ?? "") === v ? "chip !bg-ocean !text-white" : "chip"}>{l}</Link>)}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="card w-full text-left text-xs">
              <thead className="text-ocean"><tr className="border-b border-ocean/10"><th className="p-2">When</th><th className="p-2">Channel</th><th className="p-2">Event</th><th className="p-2">To</th><th className="p-2">Provider</th><th className="p-2">Status</th><th className="p-2"></th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-ocean/5 align-top">
                    <td className="p-2 whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
                    <td className="p-2">{l.channel}</td>
                    <td className="p-2">{l.event}</td>
                    <td className="p-2">{l.to}</td>
                    <td className="p-2">{l.provider}</td>
                    <td className="p-2">{l.status}{l.error && <span className="block max-w-xs text-coral-600">{l.error}</span>}</td>
                    <td className="p-2">{l.status === "FAILED" && l.event !== "OTP_CODE" && <form action={retryFailedDelivery.bind(null, l.id)}><button className="chip">Retry</button></form>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="h2">Templates</h2>
          <p className="text-sm text-muted">Use {"{{variable}}"} placeholders, e.g. {"{{name}}"}, {"{{service}}"}, {"{{when}}"}, {"{{link}}"}, {"{{code}}"}. Marketing messages need consent and an unsubscribe link.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {templates.map((t) => (
              <StatefulForm key={t.id} action={saveTemplate} submitLabel="Save" resetOnOk={false} className="card space-y-2 p-4 text-sm">
                <p className="font-semibold text-ocean">{t.event} · {t.channel} · {t.locale}</p>
                <input type="hidden" name="id" value={t.id} />
                {t.channel !== "SMS" && <input name="subject" defaultValue={t.subject ?? ""} className="input" aria-label="Subject" />}
                <textarea name="body" rows={t.channel === "EMAIL" ? 4 : 2} defaultValue={t.body} className="input font-mono text-xs" aria-label="Body" />
                {t.channel === "SMS" && <p className="text-xs text-muted">{t.body.length} characters (160 per SMS segment)</p>}
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="active" defaultChecked={t.active} className="accent-ocean" /> Active</label>
              </StatefulForm>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
