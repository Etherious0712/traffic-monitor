// Shared helpers used by the map popup, the sidebar and the charts.

// Cause id -> [label, colour]. The same colours are used for map lines, list chips and the "Causes" chart.
export const CAUSE = {
  accident: ['Accident', '#e5484d'],
  breakdown: ['Breakdown', '#f76b15'],
  roadworks: ['Roadworks', '#d39a00'],
  closure: ['Road closed', '#8e4ec6'],
  weather: ['Weather', '#0090ff'],
  hazard: ['Hazard', '#d6409f'],
  event: ['Event', '#12a594'],
  peak_hour: ['Rush hour', '#8d8d8d'],
  unknown: ['Unknown', '#8d8d8d'],
};
export const causeInfo = (c) => CAUSE[c] ?? [c, '#8d8d8d'];

export const $ = (id) => document.getElementById(id);

// Escape text before putting it into HTML: road names and news titles come from outside sources.
export const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

// Only allow http(s) links, so a feed can't slip in a javascript: URL.
export const safeUrl = (u) => (/^https?:\/\//.test(u) ? esc(u) : '#');

// localStorage that never throws: in private mode or with storage blocked, settings just aren't remembered.
export const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

// ---------- Incident text ----------

// "E11 LDP · Puchong → Sunway". The road label is only shown when TomTom gave a route number.
export const roadName = (i) =>
  [i.roadNumbers?.length ? i.label : '', i.from && i.to ? `${i.from} → ${i.to}` : i.from || i.to]
    .filter(Boolean)
    .join(' · ') || 'Unnamed road';

// "+12 min", or "Closed" for closures (TomTom gives them no delay).
export const delayText = (i) =>
  i.delay ? `+${Math.round(i.delay / 60)} min` : i.magnitudeOfDelay === 4 ? 'Closed' : '';

// Coloured cause label: ● Accident
export const chip = (c) => {
  const [label, color] = causeInfo(c);
  return `<span class="chip"><span class="dot" style="background:${color}"></span>${esc(label)}</span>`;
};

// " source 1 source 2": links to the news that explains the cause.
export const evidence = (cause) =>
  cause.evidence.map((u, n) => ` <a href="${safeUrl(u)}" target="_blank" rel="noopener">source ${n + 1}</a>`).join('');
