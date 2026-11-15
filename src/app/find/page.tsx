import { activeCategories, searchMates } from "@/lib/mates";
import { MateCard, PageHeader } from "@/components/ui";
import { DURATION_OPTIONS_HOURS, aud } from "@/lib/pricing";
import { coarse } from "@/lib/geo";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { geocode, suburbList } from "@/server/location";
import LocationFields from "@/components/LocationFields";
import MapView from "@/components/MapView";

export const dynamic = "force-dynamic";

const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
const LANGS = ["English", "Mandarin", "Cantonese", "Hindi", "Punjabi", "Tamil", "Arabic", "Spanish", "Italian", "Greek", "German", "French", "Tagalog", "Portuguese", "Somali"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type SP = Record<string, string | undefined>;

export default async function FindPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const categorySlugs = sp.category?.split(",").filter(Boolean);
  const kind = sp.kind === "HOUSEHOLD" || sp.kind === "COMPANION" ? sp.kind : undefined;
  const [categories, suburbs, user] = await Promise.all([activeCategories(), suburbList(), currentUser()]);
  const saved = user ? await db.savedLocation.findMany({ where: { userId: user.id }, orderBy: { label: "asc" } }) : [];

  // Location: explicit coords (my location / saved place, already coarse) or a geocoded suburb.
  let near: { lat: number; lng: number } | undefined;
  let nearLabel: string | undefined;
  if (sp.lat && sp.lng && Number.isFinite(+sp.lat) && Number.isFinite(+sp.lng)) {
    near = { lat: coarse(+sp.lat), lng: coarse(+sp.lng) };
    nearLabel = "your selected location";
  } else if (sp.near?.trim()) {
    const place = await geocode(sp.near);
    if (place) { near = place; nearLabel = place.label; }
  }
  const radiusKm = Math.min(Number(sp.radius) || 25, 100);

  const mates = await searchMates({
    near,
    radiusKm: near ? radiusKm : undefined,
    categorySlugs,
    serviceSlugs: sp.service ? [sp.service] : undefined,
    kind,
    state: sp.state || undefined,
    q: sp.q,
    language: sp.language || undefined,
    maxRate: sp.maxRate ? Number(sp.maxRate) : undefined,
    weekday: sp.day ? Number(sp.day) : undefined,
    hours: sp.hours ? Number(sp.hours) : undefined,
    verifiedOnly: sp.verified === "1",
    freeFirstMeet: sp.free === "1",
    groupAvailable: sp.group === "1",
    accessibility: sp.access === "1",
    insured: sp.insured === "1",
  });

  const visibleCats = kind ? categories.filter((c) => c.kind === kind) : categories;
  const selectedCat = categorySlugs?.length === 1 ? categories.find((c) => c.slug === categorySlugs[0]) : undefined;
  const title = selectedCat ? selectedCat.name : kind === "HOUSEHOLD" ? "Home & Household Assistance" : "Find a Mate";

  return (
    <>
      <PageHeader
        title={title}
        sub={selectedCat?.description ?? "Filter by activity, location, availability, budget and language. Results are ranked by relevance, verification and reliability, never by looks."}
      />
      <div className="mx-auto grid max-w-6xl gap-6 px-4 lg:grid-cols-[280px_1fr]">
        <form className="card h-fit space-y-4 p-4 text-sm" method="get">
          {kind && <input type="hidden" name="kind" value={kind} />}
          <div>
            <label className="label" htmlFor="category">Category</label>
            <select id="category" name="category" defaultValue={sp.category ?? ""} className="input">
              <option value="">All categories</option>
              {visibleCats.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.parentId ? "  — " : ""}{c.name}
                </option>
              ))}
            </select>
          </div>
          {selectedCat && selectedCat.services.length > 0 && (
            <div>
              <label className="label" htmlFor="service">{selectedCat.kind === "HOUSEHOLD" ? "Task / skill" : "Activity"}</label>
              <select id="service" name="service" defaultValue={sp.service ?? ""} className="input">
                <option value="">Any</option>
                {selectedCat.services.map((s) => (
                  <option key={s.id} value={s.slug}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          <LocationFields
            suburbs={suburbs}
            saved={saved.map((s) => ({ id: s.id, label: s.label, address: s.address, lat: s.lat, lng: s.lng }))}
            defaults={{ near: sp.near, lat: sp.lat, lng: sp.lng, radius: sp.radius }}
          />
          <div>
            <label className="label" htmlFor="q">Interest or keyword</label>
            <input id="q" name="q" defaultValue={sp.q} className="input" placeholder="e.g. hiking, Mandarin" />
          </div>
          {sp.view === "map" && <input type="hidden" name="view" value="map" />}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="state">State</label>
              <select id="state" name="state" defaultValue={sp.state ?? ""} className="input">
                <option value="">Any</option>
                {STATES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="maxRate">Max $/hr</label>
              <input id="maxRate" name="maxRate" type="number" min={20} step={5} defaultValue={sp.maxRate} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="day">Day</label>
              <select id="day" name="day" defaultValue={sp.day ?? ""} className="input">
                <option value="">Any</option>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="hours">Duration</label>
              <select id="hours" name="hours" defaultValue={sp.hours ?? ""} className="input">
                <option value="">Any</option>
                {DURATION_OPTIONS_HOURS.map((h) => <option key={h} value={h}>{h} hr</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="language">Language</label>
            <select id="language" name="language" defaultValue={sp.language ?? ""} className="input">
              <option value="">Any</option>
              {LANGS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <fieldset className="space-y-1.5">
            {[
              ["verified", "ID verified only"],
              ["free", "Offers a free first meet"],
              ["group", "Available for groups"],
              ["access", "Mobility-aware outings"],
              ["insured", "Insured (household work)"],
            ].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" name={k} value="1" defaultChecked={sp[k] === "1"} className="accent-ocean" /> {l}
              </label>
            ))}
          </fieldset>
          <button className="btn-ocean w-full">Search</button>
        </form>

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              {mates.length} Mate{mates.length === 1 ? "" : "s"} found{near && <> within {radiusKm} km of {nearLabel}</>}
              {sp.near && !near && <span className="text-coral-600"> · couldn&apos;t find &ldquo;{sp.near}&rdquo;</span>}
              {" "}· <span className="chip-coral">Sponsored</span> = paid placement
            </p>
            <div className="flex gap-1 text-sm" role="tablist" aria-label="Results view">
              {(["list", "map"] as const).map((v) => {
                const params = new URLSearchParams(Object.entries(sp).filter(([, x]) => x != null) as [string, string][]);
                params.set("view", v);
                const on = (sp.view ?? "list") === v;
                return (
                  <a key={v} role="tab" aria-selected={on} href={`/find?${params}`} className={on ? "chip !bg-ocean !text-white" : "chip"}>
                    {v === "list" ? "List" : "Map"}
                  </a>
                );
              })}
            </div>
          </div>
          {sp.view === "map" && (
            <div className="mb-4">
              <MapView
                centre={near ?? null}
                pins={mates.filter((m) => m.area).map((m) => ({ id: m.id, name: m.displayName, rate: aud(m.hourlyRateCents), area: m.area! }))}
              />
              <p className="mt-1 text-xs text-muted">Circles show each Mate&apos;s approximate service area, not where they live.</p>
            </div>
          )}
          {mates.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {mates.map((m) => <MateCard key={m.id} m={m} />)}
            </div>
          ) : (
            <div className="card p-8 text-center text-muted">No Mates match those filters. Try widening the location or budget.</div>
          )}
        </div>
      </div>
    </>
  );
}
