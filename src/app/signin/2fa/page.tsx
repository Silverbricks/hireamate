import Link from "next/link";
import { verifyStaff2fa } from "@/app/auth-actions";
import StatefulForm from "@/components/StatefulForm";
import { PageHeader } from "@/components/ui";

export default function Staff2fa() {
  return (
    <>
      <PageHeader title="Security code" sub="Staff accounts need a second step. Enter the 6-digit code we sent to your mobile." />
      <div className="mx-auto max-w-md px-4">
        <StatefulForm action={verifyStaff2fa} submitLabel="Verify and sign in" resetOnOk={false} className="card space-y-3 p-6">
          <input name="code" aria-label="Security code" className="input tracking-[0.4em]" placeholder="123456" inputMode="numeric" maxLength={6} autoComplete="one-time-code" required />
        </StatefulForm>
        <p className="mt-4 text-sm"><Link href="/signin" className="text-ocean underline">Start again</Link></p>
      </div>
    </>
  );
}
