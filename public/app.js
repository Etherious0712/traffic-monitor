// Entry point: holds the app state, polls the server, and wires up the city picker,
// history range buttons and incident list. Drawing is done by map.js, panel.js and charts.js.
import { $, store } from './util.js';
import { setIncidents, fitRegion, focusIncident } from './map.js';
import { renderPanel } from './panel.js';
import { loadHistory } from './charts.js';

let state = null; // latest /api/state
let region = store.get('region'); // id of the city on screen (remembered between visits)
let days = Number(store.get('days')) || 7; // history range: 1, 7 or 30
let historyFor = ''; // which city/range/update the history panel was drawn for

const currentRegion = () => state.regions.find((r) => r.id === region);

// Redraw everything from `state`. History is only reloaded when the city, range or data changed.
function render() {
  if (!currentRegion()) region = state.regions[0].id;
  renderPanel(state, region);
  setIncidents(state.incidents, state.traffic);
  for (const b of document.querySelectorAll('.ranges button')) {
    b.setAttribute('aria-pressed', String(Number(b.dataset.days) === days));
  }
  const key = `${region}|${days}|${state.updatedAt}`;
  if (key !== historyFor) {
    historyFor = key;
    const [r, d] = [region, days];
    loadHistory(state, r, d, () => r === region && d === days);
  }
}

// Fetch the latest data. `watch` tells the server which city is on screen, so it refreshes
// that city every few minutes (other cities only every few hours).
async function refresh() {
  try {
    const first = !state;
    state = await (await fetch(`/api/state${region ? `?watch=${encodeURIComponent(region)}` : ''}`)).json();
    render();
    if (first) {
      fitRegion(currentRegion());
      refreshSoon();
    }
  } catch {
    $('updated').textContent = 'Server unreachable, retrying…';
  }
}

// After opening a city the server fetches it within ~30 s; check back then instead of waiting a minute.
function refreshSoon() {
  refresh();
  setTimeout(refresh, 35e3);
}

// ---------- Events ----------

// Pick a city: remember it, zoom the map to it, and ask the server to refresh it.
$('region').addEventListener('change', (e) => {
  region = e.target.value;
  store.set('region', region);
  render();
  fitRegion(currentRegion());
  refreshSoon();
});

// History range buttons: 24 h / 7 days / 30 days.
document.querySelector('.ranges').addEventListener('click', (e) => {
  const d = Number(e.target.dataset?.days);
  if (!d) return;
  days = d;
  store.set('days', String(d));
  render();
});

// Click or Enter on an incident in the list: fly the map to it (links inside the row still work).
function onIncident(e) {
  const li = e.target.closest('.inc');
  if (!li || e.target.closest('a')) return;
  focusIncident(state.incidents.find((x) => x.id === li.dataset.id));
}
$('incidents').addEventListener('click', onIncident);
$('incidents').addEventListener('keydown', (e) => e.key === 'Enter' && onIncident(e));

refresh();
setInterval(refresh, 60e3);
