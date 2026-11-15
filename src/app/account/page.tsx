import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { maskEmail, maskMobile } from "@/server/auth";
import { CATEGORIES } from "@/server/comms/events";
import { suburbList } from "@/server/location";
import { currentPlan } from "@/server/membership";
import { addSavedLocation, deleteSavedLocation, savePreferences, toggleFavourite } from "@/app/account-actions";
import { revokeOtherSessions, revokeSession } from "@/app/auth-actions";
import { unblockUser } from "@/app/actions";
import { currentSessionId } from "@/server/auth";
import { fmtDateTime } from "@/lib/format";
import StatefulForm from "@/components/StatefulForm";
import { Avatar, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const hhmm = (m: number | null, d: string) => (m == null ? d : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);

export default async function Account() {
  const user = await requireUser();
  const [sessions, thisSession, blocks] = await Promise.all([
    db.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } }),
    currentSessionId(),
    db.block.findMany({ where: { blockerId: user.id }, include: { blocked: { select: { id: true, displayName: true } } } }),
  ]);
  const [prefs, locations, favourites, suburbs, plan, intros] = await Promise.all([
    db.notificationPreference.findMany({ where: { userId: user.id } }),
    db.savedLocation.findMany({ where: { userId: user.id } }),
    db.favourite.findMany({ where: { userId: user.id }, include: { mate: { select: { id: true, displayName: true, avatarHue: true, serviceSuburb: true } } } }),
    suburbList(),
    currentPlan(user),
    user.role === "CUSTOMER" ? db.introduction.findMany({ where: { customerId: user.id }, orderBy: { createdAt: "desc" }, include: { mate: { select: { displayName: true } } } }) : [],
  ]);
  const pref = (cat: string) => prefs.find((p) => p.category === cat) ?? { email: true, sms: true, push: true };
  const optional = Object.entries(CATEGORIES).filter(([, c]) => !c.essential);

  return (
    <>
      <PageHeader title="Account & settings" sub={`${user.displayName} · ${maskEmail(user.email)} · ${user.mobile ? maskMobile(user.mobile) : "no mobile"}`}>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="chip">{plan.plan?.name ?? "Free"} plan</span>
          <Link href="/membership" className="chip hover:bg-coral-100">Manage membership</Link>
          <Link href="/signin/code?mode=reset" className="chip hover:bg-coral-100">Change password</Link>
          <Link href="/help" className="chip hover:bg-coral-100">Help & support</Link>
        </div>
      </PageHeader>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 lg:grid-cols-2">
        <section id="notifications" className="card p-6">
          <h2 className="h2">Notification preferences</h2>
          <p className="text-sm text-muted">Security and safety messages are always sent.</p>
          <StatefulForm action={savePreferences} submitLabel="Save preferences" resetOnOk={false} className="mt-4 space-y-4">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ocean"><th className="py-1">Category</th><th>Email</th><th>SMS</th><th>Push</th></tr></thead>
              <tbody>
                {optional.map(([k, c]) => (
                  <tr key={k} className="border-t border-ocean/5">
                    <td className="py-2">{c.label}</td>
                    {(["email", "sms", "push"] as const).map((ch) => (
                      <td key={ch}><input type="checkbox" aria-label={`${c.label} ${ch}`} name={`${k}.${ch}`} defaultChecked={k === "MARKETING" ? user.marketingConsent && pref(k)[ch] : pref(k)[ch]} className="accent-ocean" /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <fieldset className="rounded-xl bg-ivory p-3 text-sm">
              <label className="flex items-center gap-2 font-medium"><input type="checkbox" name="quietEnabled" defaultChecked={user.quietStartMin != null} className="accent-ocean" /> Quiet hours (no SMS or push)</label>
              <div className="mt-2 flex items-center gap-2">
                <input type="time" name="quietStart" defaultValue={hhmm(user.quietStartMin, "21:00")} className="input !w-auto" aria-label="Quiet hours start" />
                <span>to</span>
                <input type="time" name="quietEnd" defaultValue={hhmm(user.quietEndMin, "08:00")} className="input !w-auto" aria-label="Quiet hours end" />
              </div>
            </fieldset>
            <fieldset className="rounded-xl bg-ivory p-3 text-sm">
              <legend className="font-medium">Emergency contact (optional, used only for SOS alerts)</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input name="emergencyContactName" defaultValue={user.emergencyContactName ?? ""} className="input" placeholder="Name" aria-label="Emergency contact name" />
                <input name="emergencyContactMobile" defaultValue={user.emergencyContactMobile ?? ""} className="input" placeholder="Mobile" aria-label="Emergency contact mobile" />
              </div>
            </fieldset>
            <div>
              <label className="label" htmlFor="locale">Language</label>
              <select id="locale" name="locale" defaultValue={user.locale} className="input">
                <option value="en-AU">English (Australia)</option>
              </select>
              <p className="mt-1 text-xs text-muted">More languages (e.g. Hindi, Punjabi) are on the roadmap.</p>
            </div>
          </StatefulForm>
        </section>

        <section className="card p-6">
          <h2 className="h2">Saved locations</h2>
          <p className="text-sm text-muted">Use these to search nearby. Only you can see them.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {locations.map((l) => (
              <li key={l.id} className="flex items-center justify-between rounded-xl bg-ivory p-3">
                <span><span className="font-semibold text-ocean">{l.label}</span> · {l.address}</span>
                <form action={deleteSavedLocation.bind(null, l.id)}><button className="text-xs text-muted underline">Remove</button></form>
              </li>
            ))}
          </ul>
          <StatefulForm action={addSavedLocation} submitLabel="Save location" className="mt-4 grid gap-2 sm:grid-cols-2">
            <select name="label" className="input" defaultValue="Home" aria-label="Label"><option>Home</option><option>Work</option><option>Other</option></select>
            <input name="suburb" list="acct-suburbs" className="input" placeholder="Suburb" aria-label="Suburb" required />
            <datalist id="acct-suburbs">{suburbs.map((s) => <option key={`${s.name}${s.state}`} value={`${s.name} ${s.state} ${s.postcode}`} />)}</datalist>
            <input name="address" className="input sm:col-span-2" placeholder="Street address (optional, private)" aria-label="Street address" />
          </StatefulForm>
        </section>

        <section className="card p-6">
          <h2 className="h2">Signed-in devices</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl bg-ivory p-3">
                <span className="min-w-0"><span className="block truncate">{s.userAgent ?? "Unknown device"}</span><span className="text-xs text-muted">Last active {fmtDateTime(s.lastSeenAt)}{s.id === thisSession && " · this device"}</span></span>
                {s.id !== thisSession && <form action={revokeSession.bind(null, s.id)}><button className="text-xs text-muted underline">Sign out</button></form>}
              </li>
            ))}
          </ul>
          {sessions.length > 1 && <form action={revokeOtherSessions} className="mt-3"><button className="btn-ghost !py-1.5">Sign out all other devices</button></form>}
        </section>

        {blocks.length > 0 && (
          <section className="card p-6">
            <h2 className="h2">Blocked</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {blocks.map((b) => (
                <li key={b.blockedId} className="flex justify-between"><span>{b.blocked.displayName}</span><form action={unblockUser.bind(null, b.blockedId)}><button className="text-xs text-muted underline">Unblock</button></form></li>
              ))}
            </ul>
          </section>
        )}

        {user.role === "CUSTOMER" && (
          <section className="card p-6">
            <h2 className="h2">Favourites ({favourites.length}/{plan.limits.favourites >= 100000 ? "∞" : plan.limits.favourites})</h2>
            {favourites.length === 0 && <p className="mt-2 text-sm text-muted">Tap ♡ on a Mate&apos;s profile to save them here.</p>}
            <ul className="mt-3 space-y-2">
              {favourites.map((f) => (
                <li key={f.mateId} className="flex items-center gap-3 text-sm">
                  <Avatar name={f.mate.displayName} hue={f.mate.avatarHue} size={32} />
                  <Link href={`/mates/${f.mate.id}`} className="flex-1 font-medium hover:underline">{f.mate.displayName} · {f.mate.serviceSuburb}</Link>
                  <form action={toggleFavourite.bind(null, f.mate.id)}><button className="text-xs text-muted underline">Remove</button></form>
                </li>
              ))}
            </ul>
          </section>
        )}

        {user.role === "CUSTOMER" && (
          <section className="card p-6">
            <h2 className="h2">My introductions</h2>
            {intros.length === 0 && <p className="mt-2 text-sm text-muted">Use &ldquo;Introduce yourself&rdquo; on a profile to say hello before booking.</p>}
            <ul className="mt-3 space-y-2 text-sm">
              {intros.map((i) => (
                <li key={i.id}><Link href={`/introductions/${i.id}`} className="flex justify-between rounded-xl bg-ivory p-3 hover:bg-ocean-100"><span>{i.mate.displayName} · {i.proposedActivity}</span><span className="chip">{i.status.toLowerCase().replace("_", " ")}</span></Link></li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
