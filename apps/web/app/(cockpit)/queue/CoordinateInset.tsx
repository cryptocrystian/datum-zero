"use client";

import { useEffect, useRef } from "react";

// Production maps render on Mapbox GL JS (dark vector). Without a token (dev/CI) we degrade to the
// branded concentric-ring target so the inset is always on-brand. No secret in the repo.
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

function ConcentricTarget() {
  return (
    <div className="blueprint-grid relative h-full w-full">
      <svg viewBox="0 0 200 180" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
        <g stroke="var(--color-datum-slate)" fill="none" strokeWidth="0.75">
          <line x1="100" y1="0" x2="100" y2="180" />
          <line x1="0" y1="90" x2="200" y2="90" />
        </g>
        <g fill="none" strokeWidth="1">
          <circle cx="100" cy="90" r="46" stroke="var(--color-datum-slate)" opacity="0.5" />
          <circle cx="100" cy="90" r="30" stroke="var(--color-datum-slate)" opacity="0.7" />
          <circle cx="100" cy="90" r="14" stroke="var(--color-tactical-gold)" />
        </g>
        <circle cx="100" cy="90" r="3" fill="var(--color-tactical-gold)" />
      </svg>
    </div>
  );
}

export function CoordinateInset({
  latitude,
  longitude,
}: {
  latitude: number | null;
  longitude: number | null;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const coords = latitude != null && longitude != null ? { lat: latitude, lon: longitude } : null;

  useEffect(() => {
    const token = MAPBOX_TOKEN;
    if (!token || !coords || !mapEl.current) return;
    let cancelled = false;
    let mapInstance: { remove: () => void } | undefined;
    void (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !mapEl.current) return;
      mapboxgl.accessToken = token;
      const m = new mapboxgl.Map({
        container: mapEl.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: [coords.lon, coords.lat],
        zoom: 17,
        interactive: false,
        attributionControl: false,
      });
      new mapboxgl.Marker({ color: "#e9d700" }).setLngLat([coords.lon, coords.lat]).addTo(m);
      mapInstance = m;
    })();
    return () => {
      cancelled = true;
      mapInstance?.remove();
    };
  }, [coords?.lat, coords?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(6)}`;

  return (
    <div className="mt-3 rounded-sm border border-datum-slate/25">
      <div className="border-b border-datum-slate/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-datum-slate">
        Coordinate Fix
      </div>
      <div className="relative h-[180px] w-full overflow-hidden">
        {MAPBOX_TOKEN && coords ? <div ref={mapEl} className="h-full w-full" /> : <ConcentricTarget />}
      </div>
      <div className="flex items-center justify-between border-t border-datum-slate/20 px-3 py-2 font-mono text-[11px]">
        <span className="text-white">{coords ? `LAT ${fmt(coords.lat)}` : "LAT ——"}</span>
        <span className="text-white">{coords ? `LON ${fmt(coords.lon)}` : "LON ——"}</span>
      </div>
    </div>
  );
}
