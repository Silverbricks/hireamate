import Link from "next/link";
import { register } from "@/app/auth-actions";
import StatefulForm from "@/components/StatefulForm";
import { PageHeader } from "@/components/ui";

export default async function Register({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const mate = (await searchParams).role === "MATE";
  const maxDob = new Date();
  maxDob.setFullYear(maxDob.getFullYear() - 18);

  return (
    <>
      <PageHeader
        title={mate ? "Become a Mate" : "Create your account"}
        sub={mate
          ? "Offer companionship, activities or household help on your terms. Your profile is reviewed before it goes live."
          : "Find company, activities and help at home. You must be 18 or older."}
      >
        <div className="mt-4 flex gap-2 text-sm">
          <Link href="/register" className={mate ? "chip" : "chip !bg-ocean !text-white"}>I&apos;m looking for a Mate</Link>
          <Link href="/register?role=MATE" className={mate ? "chip !bg-ocean !text-white" : "chip"}>I want to be a Mate</Link>
        </div>
      </PageHeader>
      <div className="mx-auto max-w-xl px-4">
        <StatefulForm action={register} submitLabel={mate ? "Create Mate account" : "Create account"} resetOnOk={false} className="card space-y-4 p-6">
          <input type="hidden" name="role" value={mate ? "MATE" : "CUSTOMER"} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="displayName">Display name</label>
              <input id="displayName" name="displayName" className="input" required maxLength={40} />
              <p className="mt-1 text-xs text-muted">Shown to others.</p>
            </div>
            <div>
              <label className="label" htmlFor="legalName">Legal name</label>
              <input id="legalName" name="legalName" className="input" autoComplete="name" required />
              <p className="mt-1 text-xs text-muted">Private. Used for verification only.</p>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="input" autoComplete="email" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="mobile">Australian mobile</label>
              <input id="mobile" name="mobile" type="tel" className="input" placeholder="04xx xxx xxx" autoComplete="tel" required />
            </div>
            <div>
              <label className="label" htmlFor="dob">Date of birth</label>
              <input id="dob" name="dob" type="date" max={maxDob.toISOString().slice(0, 10)} className="input" required />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" className="input" autoComplete="new-password" required minLength={10} />
            <p className="mt-1 text-xs text-muted">At least 10 characters, with letters and numbers.</p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="terms" className="mt-1 accent-ocean" required />
            <span>I&apos;m 18 or older and agree to the Terms, Privacy Policy and the <Link href="/safety" className="underline">community policy</Link> (platonic services only).</span>
          </label>
          <p className="text-xs text-muted">We&apos;ll text and email you a code to verify your details. We never show your mobile, email or legal name to other members.</p>
        </StatefulForm>
        <p className="mt-4 text-sm">Already have an account? <Link href="/signin" className="text-ocean underline">Sign in</Link></p>
      </div>
    </>
  );
}
