import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, isFullyVerified } from "@/lib/session";
import { devFeaturesEnabled } from "@/server/env";
import { maskEmail, maskMobile } from "@/server/auth";
import { resendCode, verifyContact } from "@/app/auth-actions";
import StatefulForm from "@/components/StatefulForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Verify() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (isFullyVerified(user)) redirect(user.role === "MATE" ? "/mate/profile" : "/");

  const steps = [
    { channel: "EMAIL" as const, done: !!user.emailVerifiedAt, label: "Email", to: maskEmail(user.email) },
    { channel: "SMS" as const, done: !!user.mobileVerifiedAt, label: "Mobile", to: user.mobile ? maskMobile(user.mobile) : "-" },
  ];

  return (
    <>
      <PageHeader title="Verify your details" sub="Enter the 6-digit codes we sent. This keeps HIRE A MATE safe for everyone." />
      <div className="mx-auto grid max-w-3xl gap-6 px-4 md:grid-cols-2">
        {steps.map((s) => (
          <div key={s.channel} className="card p-6">
            <p className="font-semibold text-ocean">{s.label} · {s.to}</p>
            {s.done ? (
              <p className="mt-3 chip">✓ Verified</p>
            ) : (
              <>
                <StatefulForm action={verifyContact} submitLabel={`Verify ${s.label.toLowerCase()}`} className="mt-3 space-y-3">
                  <input type="hidden" name="channel" value={s.channel} />
                  <input name="code" aria-label={`${s.label} code`} className="input tracking-[0.4em]" placeholder="123456" inputMode="numeric" maxLength={6} autoComplete="one-time-code" required />
                </StatefulForm>
                <form action={resendCode.bind(null, s.channel)} className="mt-2">
                  <button className="text-xs text-ocean underline">Send a new code</button>
                </form>
              </>
            )}
          </div>
        ))}
        <div className="rounded-2xl bg-ocean-100 p-4 text-sm text-ocean md:col-span-2">
          <p className="font-semibold">Age check</p>
          <p>Your date of birth confirms you&apos;re 18+. Before launch, we&apos;ll add an ID-based age check; Mates also complete identity verification before going live.</p>
        </div>
        {devFeaturesEnabled() && (
          <p className="text-sm md:col-span-2">Development: codes are in the <Link href="/dev/inbox" className="underline">dev inbox</Link>.</p>
        )}
      </div>
    </>
  );
}
