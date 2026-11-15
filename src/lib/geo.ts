// Pure geo helpers, usable on server and client.

export type LatLng = { lat: number; lng: number };

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Round a coordinate to ~1 km so a customer's precise position isn't kept in URLs or logs. */
export const coarse = (n: number) => Math.round(n * 100) / 100;

/** Travel charge (v1.2 s1.5): per-km from the Mate's service-area centre, with a minimum when charging applies. */
export function travelFeeCents(distanceKm: number | null, perKmCents: number, minCents: number) {
  if (distanceKm == null || (perKmCents <= 0 && minCents <= 0)) return 0;
  return Math.max(minCents, Math.round(distanceKm * perKmCents));
}
