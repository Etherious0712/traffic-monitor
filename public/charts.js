// History panel for one city: active incidents over time, typical delay by hour of day,
// what caused the incidents, and the most affected roads. Data comes from /api/history.
import { $, esc, causeInfo } from './util.js';

const W = 348; // chart width in SVG units; the SVG scales to the sidebar width

// Load and draw the history for `region` over the last `days`.
// `stillWanted()` says whether the user is still looking at that city/range when the data arrives.
export async function loadHistory(s, region, days, stillWanted) {
  const out = $('history');
  if (!s.history || !s.traffic) {
    out.innerHTML = `<p class="src">${s.traffic ? 'History is off.' : 'History starts once a TomTom key is set.'}</p>`;
    return;
  }
  let h;
  try {
    h = await (await fetch(`/api/history?region=${encodeURIComponent(region)}&days=${days}`)).json();
  } catch {
    out.innerHTML = '<p class="src">Could not load history.</p>';
    return;
  }
  if (!stillWanted()) return;
  if (h.series.length < 2) {
    out.innerHTML =
      '<p class="src">Not enough history yet. It builds up while the app runs (cities nobody is watching are recorded every 3 hours).</p>';
    return;
  }
  out.replaceChildren(
    lineChart(h.series, days),
    hourChart(h.byHour),
    ...(h.causes.length ? [causeBars(h.causes)] : []),
    ...(h.roads.length ? [roadList(h.roads)] : []),
  );
}

// ---------- Charts ----------

// Line: hourly average of active incidents. A crosshair and tooltip snap to the nearest hour.
function lineChart(series, days) {
  const [wrap, box] = chartBox('Active incidents (hourly average)');
  const [H, L, R, T, B] = [110, 26, 6, 8, 18]; // height and left/right/top/bottom padding
  const max = niceMax(Math.max(...series.map((p) => p.incidents)));
  const t0 = series[0].t;
  const t1 = series.at(-1).t;
  const x = (t) => L + ((t - t0) / Math.max(t1 - t0, 1)) * (W - L - R);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const peak = series.reduce((a, b) => (b.incidents > a.incidents ? b : a));
  const label = `Active incidents per hour. Peak ${peak.incidents} at ${fmtTime(peak.t)}.`;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label }, box);

  // Grid lines with values, and the date (or time, for 24 h) at both ends
  for (const v of [0, max / 2, max]) {
    el('line', { class: 'grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }, svg);
    text(svg, L - 4, y(v) + 3, String(Math.round(v)), 'end');
  }
  text(svg, L, H - 4, fmtAxis(t0, days));
  text(svg, W - R, H - 4, fmtAxis(t1, days), 'end');
  const d = series.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.incidents).toFixed(1)}`).join('');
  el('path', { class: 'series', d }, svg);

  // Hover / keyboard focus: crosshair, dot and tooltip at the nearest hour
  const cross = el('line', { class: 'cross', y1: T, y2: H - B, visibility: 'hidden' }, svg);
  const dot = el('circle', { class: 'marker', r: 4, visibility: 'hidden' }, svg);
  const hit = el('rect', { x: L, y: 0, width: W - L - R, height: H, fill: 'transparent', tabindex: 0 }, svg);
  const show = (p) => {
    const [px, py, k] = [x(p.t), y(p.incidents), box.clientWidth / W];
    for (const n of [cross, dot]) n.setAttribute('visibility', 'visible');
    attrs(cross, { x1: px, x2: px });
    attrs(dot, { cx: px, cy: py });
    tip(box, px * k, py * k, `${p.incidents} incidents`, `${fmtTime(p.t)} · ${p.delayMin} min total delay`);
  };
  const hide = () => {
    for (const n of [cross, dot]) n.setAttribute('visibility', 'hidden');
    hideTip(box);
  };
  hit.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const t = t0 + (((e.clientX - r.left) * (W / r.width) - L) / (W - L - R)) * (t1 - t0);
    show(series.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a)));
  });
  hit.addEventListener('focus', () => show(peak));
  hit.addEventListener('pointerleave', hide);
  hit.addEventListener('blur', hide);
  return wrap;
}

// Bars: average total delay for each hour of the day (Malaysia time). Each bar has its own tooltip.
function hourChart(byHour) {
  const [wrap, box] = chartBox('Typical delay by hour of day (min, Malaysia time)');
  const [H, L, R, T, B] = [100, 26, 6, 8, 18];
  const vals = Array.from({ length: 24 }, (_, h) => byHour.find((r) => r.hour === h)?.delayMin ?? null);
  const max = niceMax(Math.max(...vals.map((v) => v ?? 0)));
  const slot = (W - L - R) / 24;
  const bw = slot - 2; // bar width, leaving a 2px gap
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const worst = vals.indexOf(Math.max(...vals.map((v) => v ?? -1)));
  const label = `Delay by hour of day. Worst around ${worst}:00.`;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label }, box);
  const hh = (h) => `${String(h).padStart(2, '0')}:00`;

  for (const v of [0, max]) {
    el('line', { class: 'grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }, svg);
    text(svg, L - 4, y(v) + 3, String(v), 'end');
  }
  vals.forEach((v, h) => {
    if (h % 6 === 0) text(svg, L + h * slot + bw / 2, H - 4, hh(h), 'middle');
    if (v === null) return; // no data for this hour
    const [x0, top, base] = [L + h * slot + 1, y(v), y(0)];
    const r = Math.min(4, bw / 2, base - top);
    // Rounded at the top, square on the baseline
    const d = `M${x0},${base}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + bw - r}Q${x0 + bw},${top} ${x0 + bw},${top + r}V${base}Z`;
    const bar = el('path', { class: 'bar', tabindex: 0, d }, svg);
    el('title', {}, bar).textContent = `${hh(h)} — ${v} min`;
    const show = () => {
      const k = box.clientWidth / W;
      tip(box, (x0 + bw / 2) * k, top * k, `${v} min`, `${hh(h)}–${hh(h + 1)}`);
    };
    bar.addEventListener('pointerenter', show);
    bar.addEventListener('focus', show);
    bar.addEventListener('pointerleave', () => hideTip(box));
    bar.addEventListener('blur', () => hideTip(box));
  });
  return wrap;
}

// Horizontal bars: how many incidents had each cause, in the cause's colour.
function causeBars(causes) {
  const max = Math.max(...causes.map((c) => c.n));
  const row = (c) => {
    const [label, color] = causeInfo(c.cause);
    const fill = `<div class="fill" style="width:${(c.n / max) * 100}%;background:${color}"></div>`;
    return `<li><span>${esc(label)}</span><div class="track">${fill}</div><span class="val">${c.n}</span></li>`;
  };
  return listChart('Causes', `<ul class="hbars">${causes.map(row).join('')}</ul>`);
}

// The roads with the most incidents, and their worst delay.
function roadList(roads) {
  const row = (r) => `<li><span>${esc(r.road)}</span><span class="src">${r.n}× · worst +${r.worstMin} min</span></li>`;
  return listChart('Most affected roads', `<ol class="roads">${roads.map(row).join('')}</ol>`);
}

// ---------- Small helpers ----------

// A chart block: title + box. Returns [block, box] so the chart can draw into the box.
function chartBox(title) {
  const wrap = document.createElement('div');
  const box = Object.assign(document.createElement('div'), { className: 'chart' });
  wrap.append(Object.assign(document.createElement('div'), { className: 'chart-title', textContent: title }), box);
  return [wrap, box];
}

function listChart(title, html) {
  const [wrap, box] = chartBox(title);
  box.innerHTML = html;
  return wrap;
}

// Create an SVG element with attributes, optionally appended to `parent`.
function el(name, a = {}, parent) {
  const n = attrs(document.createElementNS('http://www.w3.org/2000/svg', name), a);
  parent?.append(n);
  return n;
}

function attrs(node, a) {
  for (const [k, v] of Object.entries(a)) node.setAttribute(k, v);
  return node;
}

function text(parent, x, y, str, anchor = 'start') {
  el('text', { x, y, 'text-anchor': anchor }, parent).textContent = str;
}

// Tooltip inside a chart box: value first (bold), label second.
function tip(box, x, y, value, label) {
  let t = box.querySelector('.tip');
  if (!t) box.append((t = Object.assign(document.createElement('div'), { className: 'tip' })));
  t.replaceChildren(
    Object.assign(document.createElement('strong'), { textContent: value }),
    Object.assign(document.createElement('span'), { textContent: label }),
  );
  Object.assign(t.style, { left: `${x}px`, top: `${y - 6}px` });
  t.hidden = false;
}

function hideTip(box) {
  const t = box.querySelector('.tip');
  if (t) t.hidden = true;
}

// Round an axis maximum up to a readable number: 37 -> 40, 110 -> 150.
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => v <= m * p) * p;
}

// Axis ends show the date ("12 Oct"), or weekday + time for the 24 h range. Tooltips always show both.
const fmtAxis = (t, days) =>
  new Date(t).toLocaleString(
    [],
    days > 1 ? { day: 'numeric', month: 'short' } : { weekday: 'short', hour: '2-digit', minute: '2-digit' },
  );
const fmtTime = (t) =>
  new Date(t).toLocaleString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
