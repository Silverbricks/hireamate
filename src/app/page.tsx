import Link from "next/link";
import { db } from "@/lib/db";
import { activeCategories, searchMates } from "@/lib/mates";
import NeedPicker from "@/components/NeedPicker";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [allNeeds, categories] = await Promise.all([
    db.need.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    activeCategories(),
  ]);
  // Hide choices whose categories are all switched off (e.g. Travel outside the launch scope, SRS v1.3 s31).
  const activeSlugs = new Set(categories.map((c) => c.slug));
  const needs = allNeeds.filter((n) => n.categorySlugs.some((s) => activeSlugs.has(s)));

  // Preload top Mates per need so the customer's choice is filtered entirely in the browser:
  // the reason they pick is never sent to the server, stored, or shown to Mates (SRS 5.3).
  const matesByNeed: Record<string, Awaited<ReturnType<typeof searchMates>>> = {};
  await Promise.all(
    needs.map(async (n) => {
      matesByNeed[n.slug] = await searchMates({ categorySlugs: n.categorySlugs }, 6);
    }),
  );

  const catMap = Object.fromEntries(categories.map((c) => [c.slug, { name: c.name, emoji: c.emoji, kind: c.kind }]));
  const topLevel = categories.filter((c) => !c.parentId);
  const household = categories.filter((c) => c.kind === "HOUSEHOLD");

  return (
    <>
      <section className="bg-ocean text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <p className="text-sm font-semibold tracking-widest text-coral uppercase">Your Mate. Your Time. Your Choice.</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
            Nobody should miss out on life because they have nobody to go with.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ocean-100">
            Book a verified Mate for coffee, dinner, an event or a weekend activity, or for practical help at home with
            cleaning, cooking, shopping and the garden.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#need" className="btn-primary">What do you need today?</a>
            <Link href="/find" className="btn border border-white/30 text-white hover:bg-white/10">Browse all Mates</Link>
          </div>
        </div>
      </section>

      <section id="need" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12">
        <h2 className="h1">What do you need today?</h2>
        <p className="mt-2 text-muted">
          Tell us what you feel like doing. We&apos;ll help you find the right Mate or activity.{" "}
          <span className="text-ocean">Your choice stays private on this device.</span>
        </p>
        <NeedPicker
          needs={needs.map((n) => ({ slug: n.slug, label: n.label, categorySlugs: n.categorySlugs }))}
          categories={catMap}
          matesByNeed={matesByNeed}
        />
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <h2 className="h2">Explore by category</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {topLevel.map((c) => (
            <Link key={c.id} href={`/find?category=${c.slug}`} className="card p-4 transition hover:shadow-md">
              <div className="text-2xl">{c.emoji}</div>
              <p className="mt-2 font-semibold text-ocean">{c.name}</p>
              <p className="text-sm text-muted">{c.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="card grid gap-6 bg-white p-6 sm:grid-cols-[1.2fr_1fr] sm:p-8">
          <div>
            <span className="chip-coral">New</span>
            <h2 className="mt-2 h2 text-2xl">Practical help at home</h2>
            <p className="mt-2 text-muted">
              Pick several tasks in one booking, such as kitchen, bathroom, laundry and dinner prep, and see the estimated time and
              price before you pay. One-off, weekly, fortnightly or monthly.
            </p>
            <Link href="/find?kind=HOUSEHOLD" className="btn-ocean mt-4">Find household help</Link>
          </div>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {household.map((c) => (
              <li key={c.id}>
                <Link href={`/find?category=${c.slug}`} className="flex items-center gap-2 rounded-xl bg-ivory p-3 hover:bg-ocean-100">
                  <span>{c.emoji}</span> {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["Verified Mates", "ID checks before Mates can take bookings. Verification is shown on every profile."],
            ["Clear prices, clear scope", "Rates, fees, inclusions and exclusions are shown before you confirm. No hidden extras."],
            ["Platonic, always", "Companionship and help only. No sexual or intimate services. Report anything in one tap."],
          ].map(([t, d]) => (
            <div key={t} className="card p-5">
              <p className="font-semibold text-ocean">{t}</p>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
