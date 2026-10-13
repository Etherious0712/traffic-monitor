// Small geography helpers, shared by the server and the page. Points are { lat, lon } in degrees.

const R = 6371e3; // Earth radius, metres
const rad = (d) => (d * Math.PI) / 180;

// Distance between two points in metres (haversine).
export function distance(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Compass direction from a to b, 0–360° (0 = north, 90 = east).
export function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Smallest angle between two directions, 0–180°.
export const angleBetween = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

// Is the point inside a [minLon, minLat, maxLon, maxLat] box?
export const inBox = (p, [w, s, e, n]) => p.lon >= w && p.lon <= e && p.lat >= s && p.lat <= n;

// A box reaching `km` from the point in every direction.
export function boxAround(p, km) {
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.cos(rad(p.lat)));
  return [p.lon - dLon, p.lat - dLat, p.lon + dLon, p.lat + dLat].map((n) => +n.toFixed(4));
}

// All points of a GeoJSON Point/LineString as { lat, lon }.
export const geometryPoints = (g) =>
  (g?.type === 'Point' ? [g.coordinates] : (g?.coordinates ?? [])).map(([lon, lat]) => ({ lat, lon }));

// The point of an incident's geometry closest to `p`, with its distance in metres.
export function nearestPoint(p, geometry) {
  let best = null;
  for (const q of geometryPoints(geometry)) {
    const d = distance(p, q);
    if (!best || d < best.distance) best = { ...q, distance: d };
  }
  return best;
}
