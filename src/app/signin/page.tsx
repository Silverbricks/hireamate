import Link from "next/link";
import { db } from "@/lib/db";
import { devFeaturesEnabled } from "@/server/env";
import { demoSignIn, signIn } from "@/app/auth-actions";
import StatefulForm from "@/components/StatefulForm";
import { Avatar, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SignIn() {
  const demo = devFeaturesEnabled();
  const users = demo
    ? await db.user.findMany({
        orderBy: [{ role: "asc" }, { displayName: "asc" }],
        select: { id: true, displayName: true, role: true, suburb: true, state: true, mateProfile: { select: { avatarHue: true } } },
      })
    : [];

  return (
    <>
      <PageHeader title="Sign in" sub="Welcome back." />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 lg:grid-cols-[420px_1fr]">
        <div className="card p-6">
          <StatefulForm action={signIn} submitLabel="Sign in" resetOnOk={false} className="space-y-4">
            <div>
              <label className="label" htmlFor="identifier">Email or mobile</label>
              <input id="identifier" name="identifier" className="input" autoComplete="username" required />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
            </div>
          </StatefulForm>
          <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
            <Link href="/signin/code" className="text-ocean underline">Sign in with a code instead</Link>
            <Link href="/signin/code?mode=reset" className="text-ocean underline">Forgot password?</Link>
          </div>
          <p className="mt-6 border-t border-ocean/10 pt-4 text-sm">
            New to HIRE A MATE? <Link href="/register" className="font-semibold text-ocean underline">Create an account</Link>
          </p>
        </div>

        {demo && (
          <div>
            <p className="chip-coral">Development only</p>
            <h2 className="mt-2 h2">Demo accounts</h2>
            <p className="text-sm text-muted">Development builds only. This is never shown in production.</p>
            {(["CUSTOMER", "MATE", "ADMIN"] as const).map((role) => (
              <section key={role} className="mt-4">
                <p className="text-sm font-semibold text-ocean">{role === "CUSTOMER" ? "Customers" : role === "MATE" ? "Mates" : "Admin"}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {users.filter((u) => u.role === role).map((u) => (
                    <form key={u.id} action={demoSignIn.bind(null, u.id)}>
                      <button className="card flex w-full items-center gap-3 p-2.5 text-left hover:shadow-md">
                        <Avatar name={u.displayName} hue={u.mateProfile?.avatarHue ?? 210} size={36} />
                        <span>
                          <span className="block font-semibold text-ocean">{u.displayName}</span>
                          <span className="text-xs text-muted">{u.suburb ? `${u.suburb}, ${u.state}` : role.toLowerCase()}</span>
                        </span>
                      </button>
                    </form>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
