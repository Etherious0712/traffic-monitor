// The header and sidebar: city picker, update time, weather banner, notices, incident list and news.
// Everything is redrawn from the latest /api/state each time (s = state, region = id of the city on screen).
import { $, esc, safeUrl, chip, roadName, delayText, evidence } from './util.js';

export function renderPanel(s, region) {
  renderPicker(s, region);
  renderUpdated(s, region);
  renderWarnings(s, region);
  renderNotices(s);
  renderIncidents(s, region);
  renderNews(s);
  $('ver').textContent = `v${s.version} · `;
}

// City picker, grouped into Peninsular / Sabah / Sarawak, with each city's incident count.
function renderPicker(s, region) {
  const count = (id) => s.incidents.filter((i) => i.region === id).length;
  const option = (r) =>
    `<option value="${esc(r.id)}"${r.id === region ? ' selected' : ''}>` +
    `${esc(r.name)}${s.traffic && r.updatedAt ? ` (${count(r.id)})` : ''}</option>`;
  const cities = (g) =>
    s.regions
      .filter((r) => r.group === g)
      .map(option)
      .join('');
  const groups = [...new Set(s.regions.map((r) => r.group))];
  $('region').innerHTML = groups.map((g) => `<optgroup label="${esc(g)}">${cities(g)}</optgroup>`).join('');
}

// "Updated 15:04" for the city on screen. Cities nobody was watching can be hours old;
// the server refreshes them within ~30 s of being opened, so say so.
function renderUpdated(s, region) {
  const at = s.regions.find((r) => r.id === region).updatedAt;
  const time = at && new Date(at).toLocaleTimeString();
  $('updated').textContent = !s.traffic
    ? ''
    : !at
      ? 'Loading this city…'
      : Date.now() - Date.parse(at) > 6 * 60e3
        ? `Updated ${time} · refreshing…`
        : `Updated ${time}`;
}

// Weather warnings that cover this city (matched by district on the server).
function renderWarnings(s, region) {
  $('warnings').innerHTML = s.warnings
    .filter((w) => w.regions.includes(region))
    .map((w) => `⚠ ${esc(w.title)} (until ${esc(w.validTo.replace('T', ' ').slice(0, 16))})`)
    .join('<br>');
}

// A missing TomTom key, and any source that failed (TomTom, weather, news, AI, history).
function renderNotices(s) {
  const notes = Object.entries(s.errors).map(([k, v]) => ['err', `${k}: ${v}`]);
  if (!s.traffic)
    notes.unshift(['', 'No TOMTOM_KEY set — showing news and weather only. Add a free key to see live traffic.']);
  $('notices').innerHTML = notes.map(([c, t]) => `<p class="notice ${c}">${esc(t)}</p>`).join('');
}

// Incidents in this city, worst delay first (the server sorts them). Clicking one flies the map to it.
function renderIncidents(s, region) {
  const mine = s.incidents.filter((i) => i.region === region);
  const row = (i) => `
    <li class="inc" tabindex="0" data-id="${esc(i.id)}">
      <div class="road">${esc(roadName(i))}</div>
      <div class="row">${chip(i.cause.cause)}<span>${esc(delayText(i))}</span><span>${esc(i.cause.source)} · ${esc(i.cause.confidence)}</span></div>
      <div class="summary">${esc(i.cause.summary)}${evidence(i.cause)}</div>
    </li>`;
  $('incidents').innerHTML = mine.length
    ? mine.map(row).join('')
    : `<li class="notice">${s.traffic ? 'No incidents right now.' : ''}</li>`;
}

// Traffic headlines from Malaysian news in the last 3 hours (all cities).
function renderNews(s) {
  const time = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const row = (n) => `
    <li><a href="${safeUrl(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>
      <div class="src">${esc(n.source)} · ${time(n.time)}</div></li>`;
  $('news').innerHTML = s.news.length
    ? s.news.map(row).join('')
    : '<li class="src">No traffic news in the last 3 hours.</li>';
}
