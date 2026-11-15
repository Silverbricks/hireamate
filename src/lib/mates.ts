import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { MateCardData } from "@/components/ui";
import { haversineKm, type LatLng } from "./geo";

export type MateFilters = {
  categorySlugs?: string[];
  serviceSlugs?: string[];
  kind?: "COMPANION" | "HOUSEHOLD";
  state?: string;
  q?: string; // suburb / interest / language free text
  language?: string;
  maxRate?: number; // AUD per hour
  weekday?: number; // 0-6
  hours?: number; // requested booking duration
  verifiedOnly?: boolean;
  freeFirstMeet?: boolean;
  groupAvailable?: boolean;
  accessibility?: boolean;
  insured?: boolean;
  near?: LatLng; // customer's chosen location (never stored)
  radiusKm?: number;
};

/**
 * Search + ranking (SRS 9.3, addendum s5).
 * Eligibility filters run first; ranking then uses only service relevance, verification,
 * reliability (completed bookings, ratings). Sponsored placement is a labelled tie-break
 * and can never override eligibility. Never ranked by attractiveness, gifts, relationship
 * status or any private customer information.
 */
export async function searchMates(f: MateFilters, take = 30): Promise<MateCardData[]> {
  const serviceWhere: Prisma.ServiceWhereInput = { active: true, category: { active: true } };
  if (f.serviceSlugs?.length) serviceWhere.slug = { in: f.serviceSlugs };
  if (f.categorySlugs?.length) {
    serviceWhere.category = {
      active: true,
      OR: [{ slug: { in: f.categorySlugs } }, { parent: { slug: { in: f.categorySlugs } } }],
    };
  }
  if (f.kind) serviceWhere.category = { ...(serviceWhere.category as object), kind: f.kind };

  const where: Prisma.MateProfileWhereInput = {
    status: "APPROVED",
    services: { some: { restricted: false, service: serviceWhere } },
  };
  const and: Prisma.MateProfileWhereInput[] = [];
  if (f.state) and.push({ state: f.state });
  if (f.maxRate) and.push({ hourlyRateCents: { lte: Math.round(f.maxRate * 100) } });
  if (f.language) and.push({ languages: { has: f.language } });
  if (f.verifiedOnly) and.push({ verified: true });
  if (f.freeFirstMeet) and.push({ offersFreeFirstMeet: true });
  if (f.groupAvailable) and.push({ groupAvailable: true });
  if (f.accessibility) and.push({ accessibilityAware: true });
  if (f.insured) and.push({ insured: true });
  if (f.weekday != null) and.push({ availability: { some: { weekday: f.weekday } } });
  if (f.hours) and.push({ minBookingHours: { lte: f.hours }, maxBookingHours: { gte: f.hours } });
  if (f.q?.trim()) {
    const q = f.q.trim();
    and.push({
      OR: [
        { displayName: { contains: q, mode: "insensitive" } },
        { serviceSuburb: { contains: q, mode: "insensitive" } },
        { intro: { contains: q, mode: "insensitive" } },
        { interests: { has: q } },
        { languages: { has: q } },
        { services: { some: { service: { name: { contains: q, mode: "insensitive" } } } } },
      ],
    });
  }
  if (and.length) where.AND = and;

  const mates = await db.mateProfile.findMany({
    where,
    include: {
      services: { where: { restricted: false }, include: { service: { include: { category: true } } } },
      reviews: { where: { hidden: false }, select: { rating: true } },
    },
    take: 200,
  });

  const wantCats = new Set(f.categorySlugs ?? []);
  const wantSvcs = new Set(f.serviceSlugs ?? []);

  // Distance search (v1.2 s1.1): within the customer's radius AND the Mate's own service radius
  // (unless the Mate accepts bookings outside their area).
  const withDistance = mates
    .map((m) => ({ m, distanceKm: f.near && m.lat != null && m.lng != null ? haversineKm(f.near, { lat: m.lat, lng: m.lng }) : null }))
    .filter(({ m, distanceKm }) => {
      if (!f.near) return true;
      if (distanceKm == null) return false;
      if (f.radiusKm && distanceKm > f.radiusKm) return false;
      return distanceKm <= m.serviceRadiusKm || m.acceptOutsideArea;
    });

  const scored = withDistance.map(({ m, distanceKm }) => {
    const relevant = m.services.filter(
      (s) =>
        wantSvcs.has(s.service.slug) ||
        wantCats.has(s.service.category.slug) ||
        (!wantCats.size && !wantSvcs.size),
    );
    const ratingCount = m.reviews.length;
    const ratingAvg = ratingCount ? m.reviews.reduce((a, r) => a + r.rating, 0) / ratingCount : null;
    const score =
      relevant.length * 3 +
      (m.verified ? 4 : 0) +
      Math.min(m.completedBookings, 30) / 10 +
      (ratingAvg ? (ratingAvg - 3) * Math.min(ratingCount, 10) * 0.3 : 0) +
      (m.sponsored ? 0.5 : 0) + // labelled, small, after eligibility
      (distanceKm != null ? Math.max(0, 3 - distanceKm / 10) : 0); // closer is better
    const ordered = [...relevant, ...m.services.filter((s) => !relevant.includes(s))];
    return {
      score,
      card: {
        id: m.id,
        displayName: m.displayName,
        intro: m.intro,
        serviceSuburb: m.serviceSuburb,
        state: m.state,
        hourlyRateCents: m.hourlyRateCents,
        verified: m.verified,
        sponsored: m.sponsored,
        avatarHue: m.avatarHue,
        offersFreeFirstMeet: m.offersFreeFirstMeet,
        languages: m.languages,
        insured: m.insured,
        serviceNames: ordered.map((s) => s.service.name),
        ratingAvg,
        ratingCount,
        distanceKm: distanceKm == null ? null : Math.round(distanceKm * 10) / 10,
        // Approximate service-area centre for the map. This is the suburb centroid, never a home address.
        area: m.lat != null && m.lng != null ? { lat: m.lat, lng: m.lng, radiusKm: m.serviceRadiusKm } : null,
      } satisfies MateCardData,
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, take)
    .map((s) => s.card);
}

export async function activeCategories() {
  return db.category.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    include: { services: { where: { active: true }, orderBy: { name: "asc" } } },
  });
}
