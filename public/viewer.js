// Shared-location page: shows one person's live position on a map, refreshed every 10 seconds,
// until the share expires or they stop it. The link looks like /share.html?t=<token>.
import { $ } from './util.js';

const token = new URLSearchParams(location.search).get('t') ?? '';
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
const map = new maplibregl.Map({
  container: 'map',
  style: `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'positron'}`,
  center: [101.62, 3.1],
  zoom: 11,
});
const marker = new maplibregl.Marker({ color: '#2a78d6' });
const time = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
let first = true;
let timer = null;

async function update() {
  const res = await fetch(`/api/share/${encodeURIComponent(token)}`).catch(() => null);
  if (!res?.ok) {
    $('status').textContent = res?.status === 404 ? 'This share has ended.' : 'Can’t reach the server, retrying…';
    if (res?.status === 404) {
      clearInterval(timer); // ended for good: stop asking
      marker.remove();
    }
    return;
  }
  const s = await res.json();
  const until = s.expires ? ` · shared until ${time(s.expires)}` : '';
  if (s.lat === null) {
    $('status').textContent = `Waiting for their location…${until}`;
    return;
  }
  marker.setLngLat([s.lon, s.lat]).addTo(map);
  if (first) map.jumpTo({ center: [s.lon, s.lat], zoom: 14 });
  first = false;
  $('status').textContent = `Last update ${time(s.at)}${until}`;
}

update();
timer = setInterval(update, 10e3);
