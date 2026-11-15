"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";

type Pin = { id: string; name: string; rate: string; area: { lat: number; lng: number; radiusKm: number } };

/**
 * Shows each Mate's approximate service area (suburb centre + radius) and the customer's chosen point.
 * Never a live or residential location (v1.2 s1.4).
 * Tiles: OpenStreetMap for development. Production needs a commercial tile/maps provider (e.g. Google Maps
 * or MapTiler), configured in Admin → Settings → Integrations.
 */
// SRS v1.3 s9.2 / s27: OSM's public tiles are development-only. Production needs NEXT_PUBLIC_MAP_TILE_URL (licensed provider).
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || (process.env.NODE_ENV !== "production" ? "https://tile.openstreetmap.org/{z}/{x}/{y}.png" : "");
const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export default function MateMap({ pins, centre }: { pins: Pin[]; centre: { lat: number; lng: number } | null }) {
  if (!TILE_URL) return <div className="grid h-[420px] place-items-center rounded-2xl bg-ocean-100 text-sm text-ocean">Map unavailable. Use the list view.</div>;
  const c = centre ?? (pins[0]?.area ? { lat: pins[0].area.lat, lng: pins[0].area.lng } : { lat: -33.8688, lng: 151.2093 });
  return (
    <MapContainer center={[c.lat, c.lng]} zoom={centre ? 11 : 10} scrollWheelZoom={false} className="h-[420px] w-full rounded-2xl" aria-label="Map of Mate service areas">
      <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
      {centre && <CircleMarker center={[centre.lat, centre.lng]} radius={8} pathOptions={{ color: "#f28c6b", fillColor: "#f28c6b", fillOpacity: 0.9 }} />}
      {pins.map((p) => (
        <Circle key={p.id} center={[p.area.lat, p.area.lng]} radius={p.area.radiusKm * 1000} pathOptions={{ color: "#123b5d", weight: 1, fillOpacity: 0.06 }}>
          <Popup>
            <Link href={`/mates/${p.id}`} className="font-semibold">{p.name}</Link>
            <br />
            {p.rate}/hr · serves within {p.area.radiusKm} km
          </Popup>
        </Circle>
      ))}
    </MapContainer>
  );
}
