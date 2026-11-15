"use client";

import { useState } from "react";

type Suburb = { name: string; state: string; postcode: string };
type Saved = { id: string; label: string; address: string; lat: number; lng: number };

/**
 * Location inputs for search (v1.2 s1.2): suburb autocomplete, "use my location" (with browser permission)
 * or a saved location. Coordinates are rounded to ~1 km before they enter the URL and are never stored.
 */
export default function LocationFields({
  suburbs, saved, defaults,
}: {
  suburbs: Suburb[];
  saved: Saved[];
  defaults: { near?: string; lat?: string; lng?: string; radius?: string };
}) {
  const [near, setNear] = useState(defaults.near ?? "");
  const [coords, setCoords] = useState<{ lat: string; lng: string } | null>(defaults.lat && defaults.lng ? { lat: defaults.lat, lng: defaults.lng } : null);
  const [status, setStatus] = useState<string | null>(null);

  const useMyLocation = () => {
    if (!navigator.geolocation) return setStatus("Location isn't available in this browser.");
    setStatus("Asking for permission…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude.toFixed(2), lng: p.coords.longitude.toFixed(2) });
        setNear("");
        setStatus("Using your approximate location (not saved).");
      },
      () => setStatus("Permission denied. Enter a suburb instead."),
      { maximumAge: 300_000, timeout: 10_000 },
    );
  };

  return (
    <div className="space-y-2">
      <label className="label" htmlFor="near">Near</label>
      <input
        id="near" name="near" list="suburb-list" value={near} className="input" placeholder="Suburb or postcode"
        onChange={(e) => { setNear(e.target.value); setCoords(null); setStatus(null); }}
      />
      <datalist id="suburb-list">
        {suburbs.map((s) => <option key={`${s.name}-${s.state}`} value={`${s.name} ${s.state} ${s.postcode}`} />)}
      </datalist>
      {coords && <><input type="hidden" name="lat" value={coords.lat} /><input type="hidden" name="lng" value={coords.lng} /></>}
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" onClick={useMyLocation} className="chip hover:bg-coral-100">📍 Use my location</button>
        {saved.map((s) => (
          <button key={s.id} type="button" className="chip hover:bg-coral-100"
            onClick={() => { setCoords({ lat: s.lat.toFixed(2), lng: s.lng.toFixed(2) }); setNear(""); setStatus(`Using ${s.label}`); }}>
            {s.label}
          </button>
        ))}
      </div>
      {status && <p className="text-xs text-muted" role="status">{status}</p>}
      <label className="label" htmlFor="radius">Within</label>
      <select id="radius" name="radius" defaultValue={defaults.radius ?? "25"} className="input">
        {[5, 10, 25, 50, 100].map((r) => <option key={r} value={r}>{r} km</option>)}
      </select>
    </div>
  );
}
