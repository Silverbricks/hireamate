import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/session";
import { suburbList } from "@/server/location";
import { getSettings } from "@/server/settings";
import { saveMateProfile } from "@/app/mate-actions";
import StatefulForm from "@/components/StatefulForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const QUALITIES = ["Friendly", "Outgoing", "Sociable", "Welcoming", "Good listener", "Conversational", "Patient", "Cheerful", "Positive", "Humorous", "Relaxed", "Active", "Adventurous", "Energetic", "Outdoorsy", "Respectful", "Reliable", "Considerate", "Punctual", "Creative", "Musical", "Sporty", "Artistic", "Helpful", "Organised", "Calm", "Professional", "Flexible", "Dependable"];

export default async function MateProfileEditor() {
  const user = await requireVerifiedUser("MATE");
  const [p, categories, suburbs, settings] = await Promise.all([
    db.mateProfile.findUniqueOrThrow({ where: { userId: user.id }, include: { services: true } }),
    db.category.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, include: { services: { where: { active: true }, orderBy: { name: "asc" } } } }),
    suburbList(),
    getSettings(),
  ]);
  const mine = new Set(p.services.filter((s) => !s.restricted).map((s) => s.serviceId));
  const restricted = new Set(p.services.filter((s) => s.restricted).map((s) => s.serviceId));
  const current = suburbs.find((s) => s.name === p.serviceSuburb && s.state === p.state);

  return (
    <>
      <PageHeader title="Your Mate profile" sub={p.status === "APPROVED" ? "Changes appear on your public profile straight away." : "Complete your profile and save to submit it for review."} />
      <div className="mx-auto max-w-4xl px-4">
        {p.statusReason && p.status !== "APPROVED" && (
          <div role="status" className="mb-4 rounded-xl bg-coral-100 p-3 text-sm text-coral-600">
            <p className="font-semibold">{p.status === "DRAFT" ? "We need more information" : p.status === "REJECTED" ? "Changes needed" : "Account status"}</p>
            <p>{p.statusReason}</p>
            <p className="mt-1 text-xs">Update your profile and save to resubmit, or contact support to appeal.</p>
          </div>
        )}
        <StatefulForm action={saveMateProfile} submitLabel={p.status === "APPROVED" ? "Save changes" : "Save & submit for review"} resetOnOk={false} className="space-y-6">
          <section className="card space-y-4 p-6">
            <h2 className="h2">About you</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="displayName">Display name</label><input id="displayName" name="displayName" defaultValue={p.displayName} className="input" required /></div>
              <div><label className="label" htmlFor="intro">One-line introduction</label><input id="intro" name="intro" defaultValue={p.intro} maxLength={160} className="input" required /></div>
            </div>
            <div><label className="label" htmlFor="about">About me</label><textarea id="about" name="about" rows={5} defaultValue={p.about} className="input" required /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="languages">Languages (comma separated)</label><input id="languages" name="languages" defaultValue={p.languages.join(", ")} className="input" /></div>
              <div><label className="label" htmlFor="interests">Interests (comma separated)</label><input id="interests" name="interests" defaultValue={p.interests.join(", ")} className="input" /></div>
            </div>
            <fieldset>
              <legend className="label">Personality (up to 10)</legend>
              <div className="flex flex-wrap gap-2 text-sm">
                {QUALITIES.map((q) => (
                  <label key={q} className="flex items-center gap-1 rounded-full border border-ocean/15 px-2.5 py-1"><input type="checkbox" name="qualities" value={q} defaultChecked={p.qualities.includes(q)} className="accent-ocean" /> {q}</label>
                ))}
              </div>
            </fieldset>
            <div><label className="label" htmlFor="experience">Experience &amp; checked qualifications (optional)</label><input id="experience" name="experience" defaultValue={p.experience ?? ""} className="input" /></div>
          </section>

          <section className="card space-y-4 p-6">
            <h2 className="h2">Services &amp; household skills</h2>
            <p className="text-sm text-muted">Only choose what you&apos;re comfortable and capable of doing. Don&apos;t present yourself as a licensed professional unless your credentials have been checked.</p>
            {categories.filter((c) => c.services.length).map((c) => (
              <fieldset key={c.id}>
                <legend className="text-sm font-semibold text-ocean">{c.emoji} {c.name}</legend>
                <div className="mt-1 flex flex-wrap gap-2 text-sm">
                  {c.services.map((s) => (
                    restricted.has(s.id) ? (
                    <span key={s.id} className="chip-coral line-through" title="Restricted by HIRE A MATE. Contact support.">{s.name}</span>
                  ) : (
                    <label key={s.id} className="flex items-center gap-1 rounded-full border border-ocean/15 px-2.5 py-1"><input type="checkbox" name="services" value={s.id} defaultChecked={mine.has(s.id)} className="accent-ocean" /> {s.name}</label>
                  )
                  ))}
                </div>
              </fieldset>
            ))}
            <div><label className="label" htmlFor="equipmentNote">Equipment (household work)</label><input id="equipmentNote" name="equipmentNote" defaultValue={p.equipmentNote ?? ""} className="input" placeholder="e.g. I bring a vacuum; customer supplies products" /></div>
          </section>

          <section className="card space-y-4 p-6">
            <h2 className="h2">Area, rates &amp; booking rules</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="suburb">Service suburb</label>
                <input id="suburb" name="suburb" list="mate-suburbs" defaultValue={current ? `${current.name} ${current.state} ${current.postcode}` : ""} className="input" required />
                <datalist id="mate-suburbs">{suburbs.map((s) => <option key={`${s.name}${s.state}`} value={`${s.name} ${s.state} ${s.postcode}`} />)}</datalist>
                <p className="mt-1 text-xs text-muted">Customers see this suburb, never your home address.</p>
              </div>
              <div><label className="label" htmlFor="serviceRadiusKm">Service radius (km)</label><input id="serviceRadiusKm" name="serviceRadiusKm" type="number" min={1} max={settings.location.maxRadiusKm} defaultValue={p.serviceRadiusKm} className="input" /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="acceptOutsideArea" defaultChecked={p.acceptOutsideArea} className="accent-ocean" /> Accept requests outside my radius (with travel charge)</label>
            <div className="grid gap-4 sm:grid-cols-4">
              <div><label className="label" htmlFor="hourlyRate">Hourly rate (AUD)</label><input id="hourlyRate" name="hourlyRate" type="number" min={25} step={1} defaultValue={p.hourlyRateCents / 100} className="input" /></div>
              <div><label className="label" htmlFor="minBookingHours">Min hours</label><input id="minBookingHours" name="minBookingHours" type="number" min={1} max={12} step={0.5} defaultValue={p.minBookingHours} className="input" /></div>
              <div><label className="label" htmlFor="maxBookingHours">Max hours</label><input id="maxBookingHours" name="maxBookingHours" type="number" min={1} max={12} step={0.5} defaultValue={p.maxBookingHours} className="input" /></div>
              <div><label className="label" htmlFor="freeFirstMeetMins">Free first meet</label>
                <select id="freeFirstMeetMins" name="freeFirstMeetMins" defaultValue={String(p.offersFreeFirstMeet ? p.freeFirstMeetMins ?? 0 : 0)} className="input">
                  <option value="0">Not offered</option><option value="30">30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option>
                </select></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><label className="label" htmlFor="fixedTravelFee">Fixed travel charge (AUD)</label><input id="fixedTravelFee" name="fixedTravelFee" type="number" min={0} max={100} step={1} defaultValue={p.fixedTravelFeeCents / 100} className="input" /></div>
              <div><label className="label" htmlFor="travelFeePerKm">Travel charge per km (AUD, 0 = none)</label><input id="travelFeePerKm" name="travelFeePerKm" type="number" min={0} max={5} step={0.1} defaultValue={p.travelFeePerKmCents / 100} className="input" /></div>
              <div><label className="label" htmlFor="minTravelFee">Minimum travel charge (AUD)</label><input id="minTravelFee" name="minTravelFee" type="number" min={0} max={100} step={1} defaultValue={p.minTravelFeeCents / 100} className="input" /></div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="groupAvailable" defaultChecked={p.groupAvailable} className="accent-ocean" /> Available for group bookings</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="accessibilityAware" defaultChecked={p.accessibilityAware} className="accent-ocean" /> Experienced with mobility-aware outings</label>
            </div>
            <div className="sm:w-1/2"><label className="label" htmlFor="introWeeklyLimit">Max new introductions per week (blank = no limit)</label><input id="introWeeklyLimit" name="introWeeklyLimit" type="number" min={0} max={100} defaultValue={p.introWeeklyLimit ?? ""} className="input" /></div>
            <div><label className="label" htmlFor="boundaries">Boundaries &amp; conditions</label><textarea id="boundaries" name="boundaries" rows={3} defaultValue={p.boundaries} className="input" required placeholder="e.g. Public places for first meetings. No alcohol obligation. Activities I don't accept…" /></div>
          </section>
          <p className="text-xs text-muted">Photos, intro video and ID verification are coming next (see roadmap). Your verification badge is set by our team after checks.</p>
        </StatefulForm>
      </div>
    </>
  );
}
