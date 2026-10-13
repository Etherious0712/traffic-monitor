// Entry point: holds the app state, polls the server, and wires up the controls.
// Drawing is done by map.js, panel.js, charts.js; Near me uses location.js, alerts.js, share.js and trips.js.
import { $, store } from './util.js';
import { distance, nearestPoint } from './geo.js';
import { setIncidents, fitRegion, focusIncident, showMe } from './map.js';
import { renderPanel } from './panel.js';
import { loadHistory } from './charts.js';
import { settings, openSettings, onSettingsSaved } from './settings.js';
import { startLocation, stopLocation, report } from './location.js';
import { findAlerts, notify } from './alerts.js';
import { renderShare } from './share.js';
import { loadTrips } from './trips.js';

let state = null; // latest /api/state
let region = store.get('region'); // id of the city on screen (remembered between visits)
let days = Number(store.get('days')) || 7; // history range: 1, 7 or 30
let historyFor = ''; // which city/range/update the history panel was drawn for
let near = null; // null = city mode; while Near me is on: { me, extra } (my position, incidents around me outside cities)
const alerted = new Map(); // incident id -> what we last alerted about (see alerts.js)

const currentRegion = () => state.regions.find((r) => r.id === region);

// All incidents the page knows about: every city's, plus the ones around me when I'm outside every city.
function allIncidents() {
  if (!near?.extra.length) return state.incidents;
  const ids = new Set(state.incidents.map((i) => i.id));
  return [...state.incidents, ...near.extra.filter((i) => !ids.has(i.id))];
}

// Near me list: incidents within the radius, nearest first.
function nearList() {
  if (!near?.me) return [];
  return allIncidents()
    .map((incident) => ({ incident, metres: nearestPoint(near.me, incident.geometry)?.distance }))
    .filter((x) => x.metres <= settings.nearKm * 1000)
    .sort((a, b) => a.metres - b.metres);
}

// Redraw everything from `state`. History is only reloaded when the city, range or data changed.
function render() {
  if (!state) return;
  if (!currentRegion()) region = state.regions[0].id;
  const nearView = near && { km: settings.nearKm, list: nearList(), waiting: !near.me };
  renderPanel(state, region, nearView);
  renderShare(Boolean(near));
  setIncidents(allIncidents(), state.traffic);
  $('near').setAttribute('aria-pressed', String(Boolean(near)));
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

// ---------- Near me ----------

// Turn location on or off. On: follow me, list what's near, alert, record trips, allow sharing.
function toggleNear() {
  if (near) {
    stopLocation();
    near = null;
    showMe(null);
    loadTrips(); // a trip may have just been recorded
    return render();
  }
  if (!navigator.geolocation) return alert('This browser cannot share its location.');
  near = { me: null, extra: [] };
  if (settings.notify && window.Notification?.permission === 'default') Notification.requestPermission();
  startLocation(onFix, (err) => {
    alert(`Location unavailable: ${err.message}`);
    if (near) toggleNear();
  });
  render();
}

// Every GPS fix: move the dot, tell the server (throttled), switch to the city I'm in, and check for alerts.
async function onFix(p) {
  if (!near) return;
  near.me = p;
  showMe(p);
  try {
    const answer = await report(p, settings.nearKm, settings.recordTrips);
    if (!near) return; // turned off while waiting
    near.extra = answer.incidents;
    const city = answer.city ?? nearestCity(p);
    region = city;
  } catch {
    // keep going with what we have; the next fix will try again
  }
  render();
  for (const a of findAlerts(p, allIncidents(), settings, alerted)) notify(a, settings);
}

// The city whose centre is closest, for when I'm between cities.
function nearestCity(p) {
  const centre = (r) => ({ lon: (r.bbox[0] + r.bbox[2]) / 2, lat: (r.bbox[1] + r.bbox[3]) / 2 });
  return state.regions.reduce((a, b) => (distance(p, centre(b)) < distance(p, centre(a)) ? b : a)).id;
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

$('near').addEventListener('click', toggleNear);
$('openSettings').addEventListener('click', openSettings);
onSettingsSaved(render);

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
  focusIncident(allIncidents().find((x) => x.id === li.dataset.id));
}
$('incidents').addEventListener('click', onIncident);
$('incidents').addEventListener('keydown', (e) => e.key === 'Enter' && onIncident(e));

refresh();
setInterval(refresh, 60e3);
loadTrips();
