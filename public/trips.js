// "My trips": this device's recorded trips. Click a trip to draw its route on the map; ✕ deletes it.
import { $ } from './util.js';
import { device } from './location.js';
import { showRoute } from './map.js';

const api = (path = '', method = 'GET') => fetch(`/api/trips${path}?device=${device}`, { method });

// Reload and draw the list.
export async function loadTrips() {
  const res = await api().catch(() => null);
  const trips = res?.ok ? await res.json() : [];
  $('trips').innerHTML = trips.length
    ? trips.map(row).join('')
    : '<li class="src">No trips yet. They are recorded while Near me is on (see ⚙ to turn this off).</li>';
}

// "Mon 12 Oct, 08:05 · 34 min · 18.2 km"
function row(t) {
  const when = new Date(t.started).toLocaleString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const minutes = Math.max(1, Math.round((t.ended - t.started) / 60e3));
  const km = (t.metres / 1000).toFixed(1);
  return `<li class="trip" data-id="${t.id}">
    <button class="link" data-show>${when} · ${minutes} min · ${km} km</button>
    <button class="del" data-delete aria-label="Delete trip">✕</button></li>`;
}

// Show a trip's route, or delete it after asking.
$('trips').addEventListener('click', async (e) => {
  const id = e.target.closest('.trip')?.dataset.id;
  if (!id) return;
  if (e.target.closest('[data-show]')) {
    const res = await api(`/${id}`);
    if (res.ok) showRoute(await res.json());
  } else if (e.target.closest('[data-delete]') && confirm('Delete this trip?')) {
    await api(`/${id}`, 'DELETE');
    showRoute(null);
    loadTrips();
  }
});
