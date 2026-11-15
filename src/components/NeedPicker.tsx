"use client";

import Link from "next/link";
import { useState } from "react";
import { MateCard, type MateCardData } from "./ui";

type Need = { slug: string; label: string; categorySlugs: string[] };

// Client-only state: the selected need is never posted, persisted, put in the URL or sent to Mates.
// Only the neutral category filter is carried forward to search.
export default function NeedPicker({
  needs,
  categories,
  matesByNeed,
}: {
  needs: Need[];
  categories: Record<string, { name: string; emoji: string; kind: string }>;
  matesByNeed: Record<string, MateCardData[]>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const need = needs.find((n) => n.slug === selected);
  const mates = selected ? matesByNeed[selected] ?? [] : [];
  const cats = need?.categorySlugs.filter((s) => categories[s]) ?? [];

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What do you need today?">
        {needs.map((n) => {
          const on = n.slug === selected;
          return (
            <button
              key={n.slug}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setSelected(on ? null : n.slug)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                on
                  ? "border-ocean bg-ocean text-white"
                  : "border-ocean/15 bg-white text-ocean hover:border-coral hover:bg-coral-100"
              }`}
            >
              {n.label}
            </button>
          );
        })}
      </div>

      {need && (
        <div className="mt-8 rounded-3xl bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Suggested for you</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {cats.map((c) => (
                  <Link key={c} href={`/find?category=${c}`} className="chip hover:bg-coral-100">
                    {categories[c].emoji} {categories[c].name}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSelected(null)} className="btn-ghost">Change</button>
              <Link href={`/find?category=${cats.join(",")}`} className="btn-primary">See all Mates &amp; filters</Link>
            </div>
          </div>
          {mates.length ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {mates.map((m) => (
                <MateCard key={m.id} m={m} />
              ))}
            </div>
          ) : (
            <p className="mt-5 text-muted">No Mates are offering this yet in your area. Try a nearby category or check back soon.</p>
          )}
        </div>
      )}
    </div>
  );
}
