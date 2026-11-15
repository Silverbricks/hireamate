import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { aud } from "@/lib/pricing";
import { Avatar, Stars } from "@/components/ui";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { isBlockedBetween } from "@/server/blocks";
import { sendIntroduction, toggleFavourite } from "@/app/account-actions";
import StatefulForm from "@/components/StatefulForm";

export const dynamic = "force-dynamic";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default async function MateProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ limit?: string }> }) {
  const { id } = await params;
  const { limit } = await searchParams;
  const viewer = await currentUser();
  // Explicit select: legal name, DOB, email and residential details are never loaded for public pages.
  const m = await db.mateProfile.findUnique({
    where: { id },
    select: {
      id: true, displayName: true, intro: true, about: true, serviceSuburb: true, state: true, serviceRadiusKm: true,
      hourlyRateCents: true, languages: true, interests: true, qualities: true, boundaries: true, verified: true,
      offersFreeFirstMeet: true, freeFirstMeetMins: true, groupAvailable: true, accessibilityAware: true, sponsored: true,
      minBookingHours: true, maxBookingHours: true, equipmentNote: true, insured: true, experience: true, avatarHue: true,
      completedBookings: true, status: true, userId: true,
      services: { include: { service: { include: { category: true } } } },
      availability: { orderBy: [{ weekday: "asc" }, { startMin: "asc" }] },
      reviews: { where: { hidden: false }, orderBy: { createdAt: "desc" }, include: { reviewer: { select: { displayName: true } } } },
    },
  });
  // Unapproved profiles are visible only to their owner and admins.
  if (!m || (m.status !== "APPROVED" && viewer?.id !== m.userId && !can(viewer, "mates.review"))) notFound();
  const isCustomer = viewer?.role === "CUSTOMER";
  const fav = isCustomer ? await db.favourite.findUnique({ where: { userId_mateId: { userId: viewer!.id, mateId: m.id } } }) : null;
  const blocked = viewer ? await isBlockedBetween(viewer.id, m.userId) : false;
  const openIntro = isCustomer ? await db.introduction.findFirst({ where: { customerId: viewer!.id, mateId: m.id }, orderBy: { createdAt: "desc" } }) : null;

  const ratingAvg = m.reviews.length ? m.reviews.reduce((a, r) => a + r.rating, 0) / m.reviews.length : null;
  const household = m.services.filter((s) => s.service.category.kind === "HOUSEHOLD");
  const companion = m.services.filter((s) => s.service.category.kind === "COMPANION");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
            <Avatar name={m.displayName} hue={m.avatarHue} size={96} />
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="h1">{m.displayName}</h1>
                {m.verified ? <span className="chip">✓ ID verified</span> : <span className="chip-coral">Verification pending</span>}
                {m.sponsored && <span className="chip-coral">Sponsored</span>}
              </div>
              <p className="text-muted">
                Serves {m.serviceSuburb}, {m.state} · within {m.serviceRadiusKm} km
              </p>
              <Stars avg={ratingAvg} count={m.reviews.length} />
              <p className="mt-2">{m.intro}</p>
            </div>
          </div>

          <section className="card p-6">
            <h2 className="h2">About me</h2>
            <p className="mt-2 text-sm leading-relaxed">{m.about}</p>
            {m.experience && <p className="mt-2 text-sm"><strong className="text-ocean">Experience:</strong> {m.experience}</p>}
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Tags title="Personality" items={m.qualities} />
              <Tags title="Interests" items={m.interests} />
              <Tags title="Languages" items={m.languages} />
            </div>
          </section>

          {companion.length > 0 && (
            <section className="card p-6">
              <h2 className="h2">Activities &amp; companionship</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {companion.map((s) => <span key={s.serviceId} className="chip">{s.service.category.emoji} {s.service.name}</span>)}
              </div>
            </section>
          )}

          {household.length > 0 && (
            <section className="card p-6">
              <h2 className="h2">Household skills &amp; services</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {household.map((s) => <span key={s.serviceId} className="chip">{s.service.category.emoji} {s.service.name}</span>)}
              </div>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="font-medium text-ocean">Equipment</dt><dd>{m.equipmentNote ?? "Discuss when booking"}</dd></div>
                <div><dt className="font-medium text-ocean">Insurance</dt><dd>{m.insured ? "Insured (checked by HIRE A MATE)" : "Not declared"}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-muted">
                Mates are not licensed cleaners, tradespeople or chefs unless stated and checked. No nursing, personal care, trade
                work or childcare.
              </p>
            </section>
          )}

          <section className="card p-6">
            <h2 className="h2">Boundaries &amp; conditions</h2>
            <p className="mt-2 text-sm">{m.boundaries}</p>
            <p className="mt-2 text-sm text-muted">
              Bookings: {m.minBookingHours}–{m.maxBookingHours} hours.{" "}
              {m.groupAvailable && "Available for group bookings. "}
              {m.accessibilityAware && "Experienced with mobility-aware outings."}
            </p>
          </section>

          <section className="card p-6">
            <h2 className="h2">Reviews</h2>
            {m.reviews.length === 0 && <p className="mt-2 text-sm text-muted">No reviews yet. Only customers with a completed booking can review.</p>}
            <ul className="mt-3 divide-y divide-ocean/10">
              {m.reviews.map((r) => (
                <li key={r.id} className="py-3 text-sm">
                  <p><span className="text-coral-600">{"★".repeat(r.rating)}</span><span className="text-ocean/20">{"★".repeat(5 - r.rating)}</span> · {r.reviewer.displayName} · <span className="text-muted">Verified booking</span></p>
                  <p className="mt-1">{r.comment}</p>
                  {r.mateReply && <p className="mt-1 border-l-2 border-coral pl-2 text-muted">{m.displayName}: {r.mateReply}</p>}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          <div className="card p-5">
            <p className="text-3xl font-bold text-ocean">{aud(m.hourlyRateCents)}<span className="text-base font-normal text-muted"> / hour</span></p>
            <p className="text-sm text-muted">{m.completedBookings} completed bookings</p>
            {m.status !== "APPROVED" && <p className="mt-3 chip-coral">Not public yet ({m.status.toLowerCase().replace("_", " ")})</p>}
            {blocked ? (
              <p className="mt-4 rounded-xl bg-ivory p-3 text-sm">You&apos;ve blocked this Mate, or they&apos;ve blocked you. Booking and messaging are unavailable. <Link href="/account" className="underline">Manage blocks</Link></p>
            ) : (
              <Link href={`/book/${m.id}`} className="btn-primary mt-4 w-full">Request a booking</Link>
            )}
            {isCustomer && (
              <form action={toggleFavourite.bind(null, m.id)} className="mt-2">
                <button className="btn-ghost w-full">{fav ? "♥ Saved to favourites" : "♡ Save to favourites"}</button>
              </form>
            )}
            {limit === "favourites" && <p role="alert" className="mt-2 rounded-xl bg-coral-100 p-2 text-xs text-coral-600">You&apos;ve reached your plan&apos;s favourites limit. <Link href="/membership" className="underline">Upgrade</Link> or remove one.</p>}
            {m.offersFreeFirstMeet && (
              <p className="mt-3 rounded-xl bg-coral-100 p-3 text-sm text-coral-600">
                {m.displayName} offers a free {m.freeFirstMeetMins}-minute first meet in a public place. Ask about it when you introduce yourself.
              </p>
            )}
            <Link href={`/report?mate=${m.id}`} className="mt-3 block text-center text-xs text-muted underline">Report this profile</Link>
          </div>
          {isCustomer && !blocked && (
            <div className="card p-5 text-sm">
              <p className="font-semibold text-ocean">Introduce yourself</p>
              {openIntro && openIntro.status !== "DECLINED" ? (
                <p className="mt-2">You&apos;ve already introduced yourself. <Link href={`/introductions/${openIntro.id}`} className="text-ocean underline">View ({openIntro.status.toLowerCase().replace("_", " ")})</Link></p>
              ) : (
                <StatefulForm action={sendIntroduction} submitLabel="Send introduction" className="mt-2 space-y-2">
                  <input type="hidden" name="mateId" value={m.id} />
                  <input name="proposedActivity" className="input" placeholder="Suggested activity, e.g. coffee in Fitzroy" required aria-label="Suggested activity" />
                  <textarea name="message" rows={3} className="input" placeholder="A short, friendly hello…" required aria-label="Introduction message" />
                  {m.offersFreeFirstMeet && <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="wantsFreeMeet" className="accent-ocean" /> Ask about a free first meet</label>}
                  <p className="text-xs text-muted">Introductions don&apos;t promise a meeting or reply. Chat opens if {m.displayName} accepts.</p>
                </StatefulForm>
              )}
            </div>
          )}
          <div className="card p-5 text-sm">
            <p className="font-semibold text-ocean">Usual availability</p>
            <ul className="mt-2 space-y-1">
              {m.availability.map((a) => (
                <li key={a.id} className="flex justify-between"><span>{DAYS[a.weekday]}</span><span className="text-muted">{hhmm(a.startMin)}–{hhmm(a.endMin)}</span></li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Tags({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-sm font-medium text-ocean">{title}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {items.map((i) => <span key={i} className="chip">{i}</span>)}
      </div>
    </div>
  );
}
