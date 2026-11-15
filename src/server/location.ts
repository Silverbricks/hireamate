import "server-only";
import { db } from "@/lib/db";
import type { LatLng } from "@/lib/geo";

// Location service (v1.2 s1). Provider "builtin" uses the Suburb gazetteer (no external calls);
// provider "google" uses the Geocoding API when GOOGLE_MAPS_API_KEY is set.

export type Place = LatLng & { label: string; suburb?: string; state?: string; postcode?: string };

async function builtinGeocode(q: string): Promise<Place | null> {
  const query = q.trim();
  if (!query) return null;
  const postcode = query.match(/\b\d{4}\b/)?.[0];
  const stateMatch = query.match(/\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b/i)?.[0]?.toUpperCase();
  const name = query.replace(/\b\d{4}\b/, "").replace(/\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b/i, "").replace(/[,]/g, " ").trim();
  const s =
    (name &&
      (await db.suburb.findFirst({
        where: { name: { equals: name, mode: "insensitive" }, ...(stateMatch ? { state: stateMatch } : {}) },
      }))) ||
    (postcode && (await db.suburb.findFirst({ where: { postcode } }))) ||
    (name && (await db.suburb.findFirst({ where: { name: { startsWith: name, mode: "insensitive" } } })));
  return s ? { lat: s.lat, lng: s.lng, label: `${s.name} ${s.state} ${s.postcode}`, suburb: s.name, state: s.state, postcode: s.postcode } : null;
}

async function googleGeocode(q: string): Promise<Place | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return builtinGeocode(q);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?region=au&components=country:AU&address=${encodeURIComponent(q)}&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) return builtinGeocode(q);
  const json = (await res.json()) as { results?: { formatted_address: string; geometry: { location: LatLng } }[] };
  const r = json.results?.[0];
  return r ? { ...r.geometry.location, label: r.formatted_address } : builtinGeocode(q);
}

export async function geocode(q: string): Promise<Place | null> {
  const row = await db.integrationSetting.findUnique({ where: { kind: "MAPS" } });
  return row?.provider === "google" ? googleGeocode(q) : builtinGeocode(q);
}

export async function suburbList() {
  return db.suburb.findMany({ orderBy: [{ state: "asc" }, { name: "asc" }], select: { name: true, state: true, postcode: true, lat: true, lng: true } });
}
