import Link from "next/link";
import { db } from "@/lib/db";
import { aud } from "@/lib/pricing";
import { fmtDate } from "@/lib/format";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { decideMate, setServiceRestricted } from "@/app/admin-actions";
import StatefulForm from "@/components/StatefulForm";
import { Avatar, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUSES = ["PENDING_REVIEW", "APPROVED", "DRAFT", "REJECTED", "SUSPENDED"] as const;

export default async function AdminMates({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const staff = await requirePermission("mates.review");
  const raw = (await searchParams).status;
  const status = (STATUSES as readonly string[]).includes(raw ?? "") ? (raw as (typeof STATUSES)[number]) : "PENDING_REVIEW";
  const mates = await db.mateProfile.findMany({
    where: { status },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { emailVerifiedAt: true, mobileVerifiedAt: true, ageVerifiedAt: true, ageVerificationMethod: true, createdAt: true } },
      services: { include: { service: true } },
    },
  });
  const decisions = await db.auditLog.findMany({
    where: { entity: "MateProfile", entityId: { in: mates.map((m) => m.id) }, action: { startsWith: "mate." } },
    orderBy: { createdAt: "desc" },
  });
  const canVerify = can(staff, "mates.verify");
  const canSuspend = can(staff, "mates.suspend");

  return (
    <>
      <PageHeader title="Mate approvals" sub="Mates appear in search only when approved. Every decision needs a reason (except approval) and is recorded.">
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {STATUSES.map((s) => (
            <Link key={s} href={`/admin/mates?status=${s}`} className={s === status ? "chip !bg-ocean !text-white" : "chip"}>{s === "DRAFT" ? "info requested / draft" : s.toLowerCase().replace("_", " ")}</Link>
          ))}
        </div>
      </PageHeader>
      <ul className="mx-auto max-w-6xl space-y-3 px-4">
        {mates.length === 0 && <li className="card p-6 text-center text-muted">Nothing here.</li>}
        {mates.map((m) => (
          <li key={m.id} className="card p-5 text-sm">
            <div className="flex flex-wrap items-start gap-4">
              <Avatar name={m.displayName} hue={m.avatarHue} size={48} />
              <div className="min-w-0 flex-1">
                <Link href={`/mates/${m.id}`} className="font-semibold text-ocean hover:underline">{m.displayName}</Link> · {m.serviceSuburb || "no suburb"} {m.state} · {aud(m.hourlyRateCents)}/hr · joined {fmtDate(m.user.createdAt)}
                <p className="mt-1">{m.intro || <em className="text-muted">No introduction yet</em>}</p>
                <p className="mt-1 text-xs">
                  Email {m.user.emailVerifiedAt ? "✓" : "✗"} · Mobile {m.user.mobileVerifiedAt ? "✓" : "✗"} · Age {m.user.ageVerifiedAt ? `✓ (${m.user.ageVerificationMethod})` : "✗"} · ID {m.verified ? "✓ verified" : "✗ not verified"} · Insurance {m.insured ? "✓" : "–"}
                </p>
                {m.statusReason && <p className="mt-1 text-xs text-coral-600">Last reason: {m.statusReason}</p>}
                <div className="mt-2 flex flex-wrap gap-1 text-xs">
                  {m.services.map((s) =>
                    canSuspend ? (
                      <form key={s.serviceId} action={setServiceRestricted.bind(null, m.id, s.serviceId, !s.restricted)}>
                        <button title={s.restricted ? "Restricted: click to allow" : "Click to restrict this service"} className={s.restricted ? "chip-coral line-through" : "chip"}>{s.service.name}</button>
                      </form>
                    ) : (
                      <span key={s.serviceId} className={s.restricted ? "chip-coral line-through" : "chip"}>{s.service.name}</span>
                    ),
                  )}
                </div>
                {decisions.filter((d) => d.entityId === m.id).length > 0 && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-ocean">Decision history</summary>
                    <ul className="mt-1 space-y-0.5 text-muted">
                      {decisions.filter((d) => d.entityId === m.id).map((d) => (
                        <li key={d.id}>{fmtDate(d.createdAt)} · {d.action.replace("mate.", "").replace("_", " ")}{(d.meta as { reason?: string } | null)?.reason ? `: ${(d.meta as { reason: string }).reason}` : ""}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              <StatefulForm action={decideMate} submitLabel="Record decision" className="w-full space-y-2 sm:w-72">
                <input type="hidden" name="mateId" value={m.id} />
                <select name="decision" className="input" aria-label={`Decision for ${m.displayName}`} required defaultValue="">
                  <option value="" disabled>Choose a decision</option>
                  {m.status !== "APPROVED" && <option value="APPROVE">Approve</option>}
                  {m.status !== "REJECTED" && m.status !== "APPROVED" && <option value="REJECT">Reject</option>}
                  {m.status !== "APPROVED" && <option value="REQUEST_INFO">Request more information</option>}
                  {canSuspend && m.status !== "SUSPENDED" && <option value="SUSPEND">Suspend</option>}
                  {canVerify && !m.verified && <option value="MARK_VERIFIED">Mark ID verified (manual)</option>}
                  {canVerify && <option value="REVERIFY">Require re-verification</option>}
                </select>
                <textarea name="reason" rows={2} className="input" placeholder="Reason (shown to the Mate)" aria-label={`Reason for ${m.displayName}`} />
              </StatefulForm>
            </div>
          </li>
        ))}
      </ul>
      <p className="mx-auto mt-4 max-w-6xl px-4 text-xs text-muted">Manual ID verification is a placeholder until an identity-verification provider is integrated (SRS v1.3 s8, Gate 2). Identity documents must never be stored in this app&apos;s database.</p>
    </>
  );
}
