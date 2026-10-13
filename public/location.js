// Live location while "Near me" is on: watches the GPS, works out speed and heading,
// and reports the position to the server (which polls the area around you and records trips).
import { store } from './util.js';
import { distance, bearing } from './geo.js';

// A random id for this browser. It is the only key to this device's trips and shares, so it stays private.
export const device = store.get('device') ?? newDevice();
function newDevice() {
  const id = crypto.randomUUID();
  store.set('device', id);
  return id;
}

let watchId = null;
let last = null; // previous fix, to derive speed/heading when the browser doesn't give them
let reported = null; // { p, at, answer } last report sent to the server

// Start watching the position. onFix gets { lat, lon, ts, speed (m/s), heading (0–360° or null) }.
export function startLocation(onFix, onError) {
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const c = pos.coords;
      const p = { lat: c.latitude, lon: c.longitude, ts: pos.timestamp, speed: c.speed, heading: c.heading };
      // Many browsers leave speed/heading empty: work them out from the previous fix.
      const moved = last ? distance(last, p) : 0;
      if (p.speed == null && last) p.speed = moved / Math.max((p.ts - last.ts) / 1000, 1);
      if ((p.heading == null || Number.isNaN(p.heading)) && moved > 10) p.heading = bearing(last, p);
      if (p.heading == null || Number.isNaN(p.heading)) p.heading = last?.heading ?? null;
      if (!last || moved > 10) last = p; // keep the old point while standing still, so heading stays stable
      onFix(p);
    },
    onError,
    { enableHighAccuracy: true, maximumAge: 5000 },
  );
}

// Stop watching and tell the server to forget this position (this also ends any share).
export function stopLocation() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = last = reported = null;
  fetch(`/api/location?device=${device}`, { method: 'DELETE' }).catch(() => {});
}

// Send the position to the server, at most every 15 s unless you moved 100 m.
// Returns { city, incidents } where incidents are the ones in the extra box around you (outside cities).
export async function report(p, km, record) {
  if (reported && Date.now() - reported.at < 15e3 && distance(reported.p, p) < 100) return reported.answer;
  const res = await fetch('/api/location', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ device, lat: p.lat, lon: p.lon, km, record }),
  });
  if (!res.ok) throw new Error(await res.text());
  reported = { p, at: Date.now(), answer: await res.json() };
  return reported.answer;
}
