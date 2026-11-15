import Link from "next/link";
import { requestCode, signInWithCode } from "@/app/auth-actions";
import StatefulForm from "@/components/StatefulForm";
import { PageHeader } from "@/components/ui";

export default async function CodeSignIn({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const reset = (await searchParams).mode === "reset";
  const purpose = reset ? "RESET_PASSWORD" : "SIGN_IN";
  return (
    <>
      <PageHeader title={reset ? "Reset your password" : "Sign in with a code"} sub="We'll send a 6-digit code to your email or mobile." />
      <div className="mx-auto grid max-w-3xl gap-6 px-4 md:grid-cols-2">
        <div className="card p-6">
          <p className="font-semibold text-ocean">1. Get a code</p>
          <StatefulForm action={requestCode} submitLabel="Send code" resetOnOk={false} className="mt-3 space-y-3">
            <input type="hidden" name="purpose" value={purpose} />
            <input name="identifier" className="input" placeholder="Email or mobile" autoComplete="username" required />
          </StatefulForm>
        </div>
        <div className="card p-6">
          <p className="font-semibold text-ocean">2. Enter it</p>
          <StatefulForm action={signInWithCode} submitLabel={reset ? "Set new password" : "Sign in"} resetOnOk={false} className="mt-3 space-y-3">
            <input type="hidden" name="purpose" value={purpose} />
            <input name="identifier" className="input" placeholder="Email or mobile" autoComplete="username" required />
            <input name="code" className="input tracking-[0.4em]" placeholder="123456" inputMode="numeric" maxLength={6} autoComplete="one-time-code" required />
            {reset && <input name="newPassword" type="password" className="input" placeholder="New password (10+ chars, letters & numbers)" autoComplete="new-password" required />}
          </StatefulForm>
        </div>
        <p className="text-sm md:col-span-2"><Link href="/signin" className="text-ocean underline">Back to sign in</Link></p>
      </div>
    </>
  );
}
