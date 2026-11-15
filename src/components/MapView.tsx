"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window`, so it's loaded client-side only.
const MateMap = dynamic(() => import("./MateMap"), {
  ssr: false,
  loading: () => <div className="grid h-[420px] place-items-center rounded-2xl bg-ocean-100 text-sm text-ocean">Loading map…</div>,
});

export default MateMap;
