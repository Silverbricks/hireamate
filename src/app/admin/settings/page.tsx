import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { configProblems } from "@/server/env";
import { DEFAULT_SETTINGS, getSettings } from "@/server/settings";
import { EMAIL_PROVIDERS, PUSH_PROVIDERS, SMS_PROVIDERS, missingEnv } from "@/server/comms/providers";
import { saveIntegration, saveSettings, sendTestMessage } from "@/app/admin-actions";
import StatefulForm from "@/components/StatefulForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const HELP: Record<string, string> = {
  customerFeeRate: "Fraction, e.g. 0.05 = 5%",
  mateCommissionRate: "Fraction, e.g. 0.15 = 15%",
  paymentWindowHours: "Time to pay after acceptance",
  freeCancellationHours: "Full refund before this many hours",
  recurringOccurrences: "Sessions created per recurring request",
  enforceAvailability: "Only allow requests inside Mate availability",
};

const INTEGRATIONS = [
  { kind: "EMAIL", label: "Email", providers: Object.values(EMAIL_PROVIDERS).map((p) => ({ name: p.name, missing: missingEnv(p) })) },
  { kind: "SMS", label: "SMS", providers: Object.values(SMS_PROVIDERS).map((p) => ({ name: p.name, missing: missingEnv(p) })), senderId: true },
  { kind: "PUSH", label: "Push notifications", providers: Object.values(PUSH_PROVIDERS).map((p) => ({ name: p.name, missing: missingEnv(p) })) },
  { kind: "MAPS", label: "Maps & geocoding", providers: [{ name: "builtin", missing: [] }, { name: "google", missing: process.env.GOOGLE_MAPS_API_KEY ? [] : ["GOOGLE_MAPS_API_KEY"] }] },
  { kind: "PAYMENTS", label: "Payments", providers: [{ name: "simulated", missing: [] }] },
] as const;

export default async function AdminSettings() {
  const staff = await requirePermission("settings.manage");
  const canIntegrations = can(staff, "integrations.manage");
  const problems = configProblems();
  const [settings, integrations, lastTests] = await Promise.all([
    getSettings(),
    db.integrationSetting.findMany(),
    db.deliveryLog.findMany({ where: { event: "INTEGRATION_TEST" }, orderBy: { createdAt: "desc" }, take: 4 }),
  ]);
  return (
    <>
      <PageHeader title="Settings & integrations" sub="Platform configuration (v1.2 s8). API keys are set as server environment variables, never stored in the database or shown here." />
      <div className="mx-auto max-w-6xl space-y-8 px-4">
        {problems.length > 0 && (
          <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">Production configuration problems</p>
            <ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        {canIntegrations && <section>
          <h2 className="h2">Integration manager</h2>
          <p className="text-sm text-muted">Switch providers without code changes. A provider with missing keys will fail deliveries and log the reason.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {INTEGRATIONS.map((i) => {
              const row = integrations.find((r) => r.kind === i.kind);
              const active = row?.provider ?? i.providers[0].name;
              const activeMissing = i.providers.find((p) => p.name === active)?.missing ?? [];
              return (
                <StatefulForm key={i.kind} action={saveIntegration} submitLabel="Save" resetOnOk={false} className="card space-y-2 p-4 text-sm">
                  <p className="font-semibold text-ocean">{i.label}</p>
                  <input type="hidden" name="kind" value={i.kind} />
                  <select name="provider" defaultValue={active} className="input" aria-label={`${i.label} provider`}>
                    {i.providers.map((p) => <option key={p.name} value={p.name}>{p.name}{p.missing.length ? ` (needs ${p.missing.join(", ")})` : ""}</option>)}
                  </select>
                  {"senderId" in i && <input name="senderId" defaultValue={(row?.config as { senderId?: string } | undefined)?.senderId ?? ""} className="input" placeholder="SMS sender ID (optional)" aria-label="SMS sender ID" />}
                  <p className={activeMissing.length ? "text-xs text-coral-600" : "text-xs text-muted"}>
                    {activeMissing.length ? `Not configured: set ${activeMissing.join(", ")}` : active === "console" || active === "simulated" || active === "builtin" ? "Development provider active" : "Configured"}
                  </p>
                </StatefulForm>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-ocean">Test connection:</span>
            <form action={sendTestMessage.bind(null, "EMAIL")}><button className="btn-ghost !py-1.5">Send test email to me</button></form>
            <form action={sendTestMessage.bind(null, "SMS")}><button className="btn-ghost !py-1.5">Send test SMS to me</button></form>
            {lastTests.map((t) => <span key={t.id} className={t.status === "SENT" ? "chip" : "chip-coral"}>{t.channel} via {t.provider}: {t.status.toLowerCase()}{t.error ? " (" + t.error.slice(0, 60) + ")" : ""}</span>)}
          </div>
          <p className="mt-2 text-xs text-muted">Delivery and failure logs: Communications. Development providers (console, simulated, builtin) refuse to send or charge in production.</p>
        </section>}

        <section className="grid gap-4 md:grid-cols-2">
          {(Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]).map((section) => (
            <StatefulForm key={section} action={saveSettings} submitLabel={`Save ${section}`} resetOnOk={false} className="card space-y-3 p-5 text-sm">
              <h2 className="h2 capitalize">{section}</h2>
              <input type="hidden" name="section" value={section} />
              {Object.entries(settings[section]).map(([k, v]) => (
                <div key={k}>
                  <label className="label" htmlFor={`${section}.${k}`}>{k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</label>
                  {typeof v === "boolean" ? (
                    <select id={`${section}.${k}`} name={k} defaultValue={String(v)} className="input"><option value="true">Yes</option><option value="false">No</option></select>
                  ) : (
                    <input id={`${section}.${k}`} name={k} defaultValue={String(v)} type={typeof v === "number" ? "number" : "text"} step="any" className="input" />
                  )}
                  {HELP[k] && <p className="mt-0.5 text-xs text-muted">{HELP[k]}</p>}
                </div>
              ))}
            </StatefulForm>
          ))}
        </section>
      </div>
    </>
  );
}
