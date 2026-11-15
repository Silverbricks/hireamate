import Link from "next/link";
import type { MateProfile } from "@prisma/client";
import { aud } from "@/lib/pricing";

export function Avatar({ name, hue, size = 56 }: { name: string; hue: number; size?: number }) {
  return (
    <div
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size / 2.6,
        background: `linear-gradient(135deg, hsl(${hue} 55% 55%), hsl(${(hue + 40) % 360} 60% 40%))`,
      }}
    >
      {name.slice(0, 1)}
    </div>
  );
}

export function Stars({ avg, count }: { avg: number | null; count: number }) {
  if (!count || avg == null) return <span className="text-xs text-muted">New Mate</span>;
  return (
    <span className="text-xs text-muted">
      <span className="text-coral-600">★</span> {avg.toFixed(1)} ({count} review{count === 1 ? "" : "s"})
    </span>
  );
}

export type MateCardData = Pick<
  MateProfile,
  | "id"
  | "displayName"
  | "intro"
  | "serviceSuburb"
  | "state"
  | "hourlyRateCents"
  | "verified"
  | "sponsored"
  | "avatarHue"
  | "offersFreeFirstMeet"
  | "languages"
  | "insured"
> & {
  serviceNames: string[];
  ratingAvg: number | null;
  ratingCount: number;
  distanceKm?: number | null;
  area?: { lat: number; lng: number; radiusKm: number } | null;
};

export function MateCard({ m }: { m: MateCardData }) {
  return (
    <Link
      href={`/mates/${m.id}`}
      className="card flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <Avatar name={m.displayName} hue={m.avatarHue} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-ocean">{m.displayName}</span>
            {m.verified && <span className="chip">✓ ID verified</span>}
            {m.sponsored && <span className="chip-coral">Sponsored</span>}
          </div>
          <p className="text-xs text-muted">
            {m.serviceSuburb}, {m.state}
            {m.distanceKm != null && <> · {m.distanceKm < 1 ? "<1" : Math.round(m.distanceKm)} km away</>}
          </p>
          <Stars avg={m.ratingAvg} count={m.ratingCount} />
        </div>
        <div className="text-right">
          <p className="font-bold text-ocean">{aud(m.hourlyRateCents)}</p>
          <p className="text-xs text-muted">per hour</p>
        </div>
      </div>
      <p className="line-clamp-2 text-sm">{m.intro}</p>
      <div className="flex flex-wrap gap-1.5">
        {m.serviceNames.slice(0, 4).map((s) => (
          <span key={s} className="chip">
            {s}
          </span>
        ))}
        {m.serviceNames.length > 4 && <span className="chip">+{m.serviceNames.length - 4}</span>}
        {m.offersFreeFirstMeet && <span className="chip-coral">Free first meet</span>}
        {m.insured && <span className="chip">Insured</span>}
      </div>
      <p className="text-xs text-muted">Speaks {m.languages.join(", ")}</p>
    </Link>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-6">
      <h1 className="h1">{title}</h1>
      {sub && <p className="mt-2 max-w-2xl text-muted">{sub}</p>}
      {children}
    </div>
  );
}
