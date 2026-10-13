import http from 'node:http';
import fs from 'node:fs/promises';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openHistory } from './history.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(ROOT, 'public', 'index.html');
const { version } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const env = process.env;
const TOMTOM_KEY = env.TOMTOM_KEY || '';
const AI_ON = Boolean(env.AI_BASE_URL);
const AI_MAX_CALLS_PER_DAY = Number(env.AI_MAX_CALLS_PER_DAY) || 200;
const HISTORY_DAYS = Number(env.HISTORY_DAYS) || 90;
const DAY = 864e5;
const MIN = 60e3;
// A city someone is looking at refreshes every POLL_MINUTES; the rest every SLOW_POLL_MINUTES.
const FAST_MS = (Number(env.POLL_MINUTES) || 5) * MIN;
const SLOW_MS = (Number(env.SLOW_POLL_MINUTES) || 180) * MIN;
const WATCH_MS = 10 * MIN; // a city counts as watched for 10 min after a page last asked for it
const TOMTOM_DAILY_LIMIT = Number(env.TOMTOM_DAILY_LIMIT) || 2400; // free tier is 2,500 incident calls a day

// One row per city. bbox = [minLon, minLat, maxLon, maxLat] (TomTom allows up to 10,000 km²); `around` builds
// one from a town centre. The text columns match MET Malaysia warnings (see warningCovers): Peninsular rows give
// the state and the districts inside the box; Sabah/Sarawak rows give the town's division and districts.
const around = (lat, lon, d = 0.15) => [lon - d, lat - d, lon + d, lat + d].map((n) => +n.toFixed(3));
const city = (group, name, bbox, states, districts, divisions = '') => ({
  id: name.toLowerCase().replaceAll(' ', '-'),
  name,
  group,
  bbox,
  states,
  districts: districts.split(', '),
  divisions: divisions.split(', '),
});
const peninsular = (name, bbox, states, districts) => city('Peninsular', name, bbox, states, districts);
const sabah = (name, bbox, division, districts = name) => city('Sabah', name, bbox, /Sabah/i, districts, division);
const sarawak = (name, bbox, division = name, districts = name) =>
  city('Sarawak', name, bbox, /Sarawak/i, districts, division);

// prettier-ignore
export const ALL_REGIONS = [
  peninsular('Klang Valley',     [101.3, 2.8, 101.9, 3.4],    /Selangor|Kuala Lumpur|Putrajaya/i,   'Petaling, Gombak, Hulu Langat, Klang, Sepang, Kuala Langat'),
  peninsular('Penang',           [100.15, 5.2, 100.6, 5.6],   /Penang|Pulau Pinang/i,               'Timur Laut, Barat Daya, Seberang Perai Utara, Seberang Perai Tengah, Seberang Perai Selatan'),
  peninsular('Johor Bahru',      [103.5, 1.35, 104.0, 1.7],   /Johor/i,                             'Johor Bahru, Kulai'),
  peninsular('Ipoh',             [100.95, 4.45, 101.2, 4.75], /Perak/i,                             'Kinta'),
  peninsular('Taiping',          around(4.855, 100.744),      /Perak/i,                             'Larut Matang, Larut, Matang'),
  peninsular('Melaka',           [102.1, 2.1, 102.4, 2.35],   /Melaka|Malacca/i,                    'Melaka Tengah, Alor Gajah'),
  peninsular('Seremban',         around(2.723, 101.94),       /Negeri Sembilan|N\. Sembilan/i,     'Seremban'),
  peninsular('Alor Setar',       around(6.123, 100.368),      /Kedah/i,                             'Kota Setar'),
  peninsular('Sungai Petani',    around(5.644, 100.487),      /Kedah/i,                             'Kuala Muda'),
  peninsular('Kangar',           around(6.439, 100.194),      /Perlis/i,                            'Kangar'),
  peninsular('Kuantan',          around(3.797, 103.322),      /Pahang/i,                            'Kuantan'),
  peninsular('Kota Bharu',       around(6.125, 102.238),      /Kelantan/i,                          'Kota Bharu'),
  peninsular('Kuala Terengganu', around(5.33, 103.138),       /Terengganu/i,                        'Kuala Terengganu, Kuala Nerus'),
  sabah('Kota Kinabalu', [115.95, 5.85, 116.2, 6.1], 'West Coast', 'Kota Kinabalu, Penampang, Putatan'),
  sabah('Sandakan',      around(5.839, 118.116),     'Sandakan'),
  sabah('Tawau',         around(4.244, 117.885),     'Tawau'),
  sabah('Lahad Datu',    around(5.022, 118.328),     'Tawau'),
  sabah('Keningau',      around(5.332, 116.152),     'Interior'),
  sarawak('Kuching',  [110.2, 1.4, 110.5, 1.65], 'Kuching, Samarahan', 'Kuching, Samarahan'),
  sarawak('Sri Aman', around(1.238, 111.462)),
  sarawak('Sarikei',  around(2.129, 111.523)),
  sarawak('Sibu',     around(2.3, 111.871)),
  sarawak('Kapit',    around(2.014, 112.936)),
  sarawak('Bintulu',  around(3.187, 113.047)),
  sarawak('Miri',     around(4.394, 113.988)),
  sarawak('Limbang',  around(4.753, 115.009, 0.12)),
  sarawak('Lawas',    around(4.86, 115.408, 0.12), 'Limbang'),
];
const wanted = (env.REGIONS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const REGIONS = wanted.length ? ALL_REGIONS.filter((r) => wanted.includes(r.id)) : ALL_REGIONS;
if (!REGIONS.length) throw new Error(`REGIONS matched nothing. Use any of: ${ALL_REGIONS.map((r) => r.id).join(', ')}`);

const FEEDS = [
  'https://www.nst.com.my/feed',
  'https://www.freemalaysiatoday.com/feed/',
  'https://www.malaymail.com/feed/rss/malaysia',
  'https://www.bernama.com/en/rssfeed.php',
  'https://www.hmetro.com.my/feed',
  'https://www.bharian.com.my/feed',
  'https://www.sinarharian.com.my/rssFeed/211',
];
const NEWS_MAX_AGE_MS = 3 * 3600e3;
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; traffic-monitor)' };

export const CAUSES = [
  'accident',
  'breakdown',
  'roadworks',
  'closure',
  'weather',
  'hazard',
  'event',
  'peak_hour',
  'unknown',
];

// TomTom iconCategory -> cause. 0 (unknown) and 6 (jam) carry no cause, so we infer one.
const TOMTOM_CAUSE = {
  1: 'accident',
  2: 'weather',
  3: 'hazard',
  4: 'weather',
  5: 'weather',
  7: 'closure',
  8: 'closure',
  9: 'roadworks',
  10: 'weather',
  11: 'weather',
  14: 'breakdown',
};

// English + Malay. First match wins.
const CAUSE_WORDS = [
  ['accident', /kemalangan|accident|crash|nahas|rempuh|terbabas|collision|pile-?up|terbalik|overturn/i],
  ['breakdown', /rosak|break ?down|broke down/i],
  ['roadworks', /kerja-kerja|roadworks?|road works|naik taraf|penyelenggaraan|maintenance|resurfac|turap/i],
  ['closure', /ditutup|penutupan|closed|closure|lencongan|diver(?:sion|ted)/i],
  ['weather', /banjir|flood|hujan|heavy rain|ribut|storm/i],
  ['hazard', /pokok tumbang|fallen tree|tanah runtuh|landslide|tumpahan|spill|kebakaran|fire/i],
  ['event', /perhimpunan|rally|konsert|concert|perarakan|parade|perlawanan|marathon|larian|festival|himpunan/i],
];
// A headline is traffic news if it's clearly about traffic, or mentions an incident word plus a road/vehicle
// (so "schools closed" or a sports "crash" don't count).
const TRAFFIC_NEWS = /kesesakan|sesak|traffic|trafik|lalu lintas|kemalangan|lebuhraya|highway|expressway|road closure/i;
const INCIDENT_WORDS = /accident|crash|nahas|rempuh|terbabas|ditutup|closed|banjir|flood|pokok tumbang|fallen tree/i;
const ROAD_CONTEXT =
  /jalan|road|lorong|laluan|kenderaan|vehicle|kereta|\bcar\b|lori|lorry|motosikal|motorcycl|\bbas\b|\bbus\b/i;

// Common names for route numbers, so an E11 incident also matches news that says "LDP".
// The first name is also used as the label in history. Numbers whose sources disagree are left out.
const ROUTE_NAMES = {
  E1: ['PLUS', 'NKVE', 'North-South Expressway', 'Lebuhraya Utara-Selatan'],
  E2: ['PLUS', 'North-South Expressway', 'Lebuhraya Utara-Selatan', 'KL-Seremban'],
  E3: ['Second Link', 'Linkedua'],
  E5: ['KESAS'],
  E6: ['ELITE'],
  E8: ['Karak', 'LPT'],
  E9: ['BESRAYA'],
  E10: ['NPE'],
  E11: ['LDP', 'Damansara-Puchong'],
  E12: ['AKLEH'],
  E13: ['LKSA', 'Kemuning-Shah Alam'],
  E14: ['EDL', 'Eastern Dispersal Link'],
  E15: ['BKE', 'Butterworth-Kulim'],
  E17: ['BORR', 'Butterworth Outer Ring'],
  E18: ['SILK'],
  E20: ['MEX', 'Maju Expressway'],
  E21: ['LEKAS'],
  E23: ['SPRINT'],
  E26: ['SKVE', 'South Klang Valley'],
  E31: ['DASH'],
  E33: ['DUKE'],
  E35: ['GCE', 'Guthrie'],
  E36: ['Penang Bridge', 'Jambatan Pulau Pinang'],
  E38: ['SMART'],
  FT2: ['Federal Highway', 'Lebuhraya Persekutuan'],
  FT28: ['MRR2', 'Middle Ring Road 2'],
};

// TomTom writes federal routes as bare numbers ("2" = Federal Highway). Never match a bare number in news:
// "2 killed" isn't about route 2.
const routeId = (n) => (/^\d+$/.test(n) ? `FT${n}` : n);

// ---------- pure logic (tested in check.js) ----------

export function roadTokens(inc) {
  const t = new Set();
  for (const id of (inc.roadNumbers ?? []).map(routeId)) {
    t.add(id);
    for (const a of ROUTE_NAMES[id] ?? []) t.add(a);
  }
  for (const s of [inc.from, inc.to]) {
    for (const part of (s ?? '').split(/[()/,]/)) if (part.trim().length >= 6) t.add(part.trim());
  }
  return [...t];
}

// Label used to group incidents in history: "E11 LDP", or the start location for unnumbered roads.
// Asian Highway numbers (AH2) are dropped when a local number is also given.
export function roadLabel(inc) {
  let ids = (inc.roadNumbers ?? []).map(routeId);
  if (ids.some((n) => !n.startsWith('AH'))) ids = ids.filter((n) => !n.startsWith('AH'));
  return ids.map((n) => (ROUTE_NAMES[n] ? `${n} ${ROUTE_NAMES[n][0]}` : n)).join(' / ') || inc.from || '';
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Short tokens (E11, LDP, PLUS) are matched case-sensitively so "plus" in prose doesn't count.
export function mentions(title, tokens) {
  return tokens.some((t) => new RegExp(`\\b${escapeRe(t)}\\b`, t.length <= 5 ? '' : 'i').test(title));
}

export function isTrafficNews(title) {
  return TRAFFIC_NEWS.test(title) || (INCIDENT_WORDS.test(title) && ROAD_CONTEXT.test(title));
}

export function isPeakHour(now) {
  const myt = new Date(now.getTime() + 8 * 3600e3); // Malaysia is UTC+8, no DST
  const day = myt.getUTCDay();
  const h = myt.getUTCHours();
  return day >= 1 && day <= 5 && ((h >= 7 && h < 10) || (h >= 17 && h < 20));
}

const list = (s) =>
  s
    .split(/,|\band\b/)
    .map((x) => x.trim())
    .filter(Boolean);
const named = (names, wanted = []) => names.some((n) => wanted.some((w) => w.toLowerCase() === n.toLowerCase()));

// Split on commas and " and " that are outside brackets: "West Coast, Tawau (Lahad Datu and Kunak)".
function splitTop(s) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (depth === 0 && (s[i] === ',' || s.startsWith(' and ', i))) {
      out.push(s.slice(start, i));
      start = i + (s[i] === ',' ? 1 : 5);
      i = start - 1;
    }
  }
  out.push(s.slice(start));
  return out.map((p) => p.trim()).filter(Boolean);
}

// Warning text lists areas separated by "•", and anything after "until" is the expiry time:
//   "Perlis • Perak (Kerian and Hulu Perak) • Sabah: West Coast, Tawau (Lahad Datu) • Sarawak: Miri (Marudi), Limbang"
// - a state on its own covers the whole state
// - "State (districts)" covers only those districts
// - Sabah/Sarawak list divisions after a colon: a division on its own covers all of it,
//   "Division (districts)" only those districts. So "Miri (Marudi)" does not cover Miri town.
export function warningCovers(text, region) {
  const body = (text ?? '').split(/\buntil\b/i)[0];
  return body.split('•').some((seg) => {
    if (!region.states.test(seg)) return false;
    const colon = seg.indexOf(':');
    if (colon < 0) {
      const inner = seg.match(/\(([^)]*)\)/);
      return !inner || named(list(inner[1]), region.districts);
    }
    return splitTop(seg.slice(colon + 1)).some((item) => {
      const [, division, districts] = item.match(/^([^(]+?)\s*(?:\(([^)]*)\))?$/) ?? [];
      if (!division) return false;
      return districts ? named(list(districts), region.districts) : named([division], region.divisions);
    });
  });
}

// data.gov.my times are local (UTC+8) without an offset. Drops marine warnings and ones outside our regions.
export function relevantWarnings(raw, now, regions = REGIONS) {
  return raw
    .filter((w) => {
      const from = new Date(`${w.valid_from}+08:00`);
      const to = new Date(`${w.valid_to}+08:00`);
      return from <= now && now <= to && !/sea|laut/i.test(`${w.warning_issue?.title_en} ${w.heading_en}`);
    })
    .map((w) => ({
      title: w.warning_issue?.title_en ?? w.heading_en,
      text: w.text_en,
      validTo: w.valid_to,
      regions: regions.filter((r) => warningCovers(w.text_en, r)).map((r) => r.id),
    }))
    .filter((w) => w.regions.length);
}

export function causeOf(inc, news, warnings, now) {
  const known = TOMTOM_CAUSE[inc.iconCategory];
  if (known) {
    const summary = (inc.events ?? []).map((e) => e.description).join('; ') || known;
    return { cause: known, confidence: 'high', source: 'TomTom', summary, evidence: [] };
  }
  const tokens = roadTokens(inc);
  for (const n of news) {
    if (!mentions(n.title, tokens)) continue;
    const hit = CAUSE_WORDS.find(([, re]) => re.test(n.title));
    if (hit) return { cause: hit[0], confidence: 'medium', source: 'news', summary: n.title, evidence: [n.link] };
  }
  const rain = warnings.find(
    (w) => w.regions.includes(inc.region) && /rain|thunderstorm|storm|flood/i.test(`${w.title} ${w.text}`),
  );
  if (rain) return { cause: 'weather', confidence: 'low', source: 'MET Malaysia', summary: rain.title, evidence: [] };
  if (isPeakHour(now))
    return {
      cause: 'peak_hour',
      confidence: 'low',
      source: 'rules',
      summary: 'Usual rush-hour congestion',
      evidence: [],
    };
  return { cause: 'unknown', confidence: 'low', source: 'rules', summary: 'No cause found yet', evidence: [] };
}

const decode = (s) =>
  s
    .replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(n))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

// ponytail: regex RSS parsing, fine for title/link/pubDate. Swap for an XML parser if a feed breaks it.
export function parseRss(xml, source) {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/g)].map(([item]) => {
    const tag = (n) => decode(item.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`))?.[1] ?? '');
    return { title: tag('title'), link: tag('link'), time: Date.parse(tag('pubDate')), source };
  });
}

// Never trust model output: unknown causes become "unknown", links must come from the news we sent.
export function validateAi(out, news) {
  const urls = new Set(news.map((n) => n.link));
  const cause = CAUSES.includes(out?.cause) ? out.cause : 'unknown';
  const evidence = (Array.isArray(out?.evidence_urls) ? out.evidence_urls : []).filter((u) => urls.has(u));
  let confidence = ['high', 'medium', 'low'].includes(out?.confidence) ? out.confidence : 'low';
  if (!evidence.length && !['peak_hour', 'unknown'].includes(cause)) confidence = 'low';
  return { cause, confidence, source: 'AI', summary: String(out?.summary ?? '').slice(0, 300), evidence };
}

// Which regions to fetch now: watched ones once FAST_MS has passed, the rest once SLOW_MS has.
export function dueRegions(regions, now, fetchedAt, watchedAt, fast = FAST_MS, slow = SLOW_MS) {
  return regions.filter((r) => {
    const watched = now - (watchedAt.get(r.id) ?? -Infinity) < WATCH_MS;
    return now - (fetchedAt.get(r.id) ?? -Infinity) >= (watched ? fast : slow);
  });
}

// ---------- fetching ----------

async function get(url, as) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20e3) });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`); // host only: never leak the key
  return res[as]();
}

const FIELDS =
  '{incidents{geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,iconCategory},startTime,from,to,length,delay,roadNumbers,lastReportTime}}}';

const watchedAt = new Map(); // region id -> last time a page showed it
const fetchedAt = new Map(); // region id -> last fetch attempt
let tomtomDay = '';
let tomtomCalls = 0;

// Fetch the due regions one after another (gentle on the free tier's rate limit); other regions keep their data.
// A region that fails keeps its previous incidents and is left out of history for this poll.
async function fetchIncidents(due, prev, now) {
  const errors = {}; // message -> cities, so one bad key isn't repeated for every city
  const today = now.toISOString().slice(0, 10); // ponytail: counted per UTC day; TomTom's own reset time isn't documented
  if (today !== tomtomDay) [tomtomDay, tomtomCalls] = [today, 0];
  const updated = new Map();
  for (const r of due) {
    if (tomtomCalls >= TOMTOM_DAILY_LIMIT) {
      (errors[`daily limit of ${TOMTOM_DAILY_LIMIT} calls reached, resumes 08:00 Malaysia time`] ??= []).push(r.name);
      continue;
    }
    tomtomCalls++;
    fetchedAt.set(r.id, now.getTime());
    const url =
      `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${TOMTOM_KEY}&bbox=${r.bbox.join(',')}` +
      `&fields=${encodeURIComponent(FIELDS)}&language=en-GB&timeValidityFilter=present`;
    try {
      const { incidents: list = [] } = await get(url, 'json');
      updated.set(
        r.id,
        list.map((f) => ({ ...f.properties, region: r.id, geometry: f.geometry })),
      );
      state.regions.find((x) => x.id === r.id).updatedAt = now.toISOString();
    } catch (e) {
      (errors[e.message] ??= []).push(r.name);
    }
  }
  const failed = Object.entries(errors);
  if (failed.length)
    state.errors.tomtom = failed
      .map(([msg, names]) => `${names.length === REGIONS.length ? 'all cities' : names.join(', ')}: ${msg}`)
      .join('; ');
  else if (due.length) delete state.errors.tomtom;
  const incidents = [...prev.filter((i) => !updated.has(i.region)), ...[...updated.values()].flat()];
  return { incidents, fresh: [...updated.keys()] };
}

const midpoint = (g) =>
  (g?.type === 'Point' ? g.coordinates : g?.coordinates?.[Math.floor(g.coordinates.length / 2)]) ?? [];

async function fetchWarnings(now) {
  return relevantWarnings(await get('https://api.data.gov.my/weather/warning?limit=20', 'json'), now);
}

async function fetchNews(now) {
  const results = await Promise.allSettled(
    FEEDS.map(async (u) => parseRss(await get(u, 'text'), new URL(u).host.replace(/^www\./, ''))),
  );
  if (results.every((r) => r.status === 'rejected')) throw new Error('all news feeds failed');
  const seen = new Set();
  return results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter(
      (n) =>
        n.link && now - n.time < NEWS_MAX_AGE_MS && isTrafficNews(n.title) && !seen.has(n.link) && seen.add(n.link),
    )
    .sort((a, b) => b.time - a.time);
}

const AI_PROMPT = `You explain why a road in Malaysia is congested.
You get one traffic incident, recent news headlines, active weather warnings and the local time.
Reply with JSON only: {"cause": one of ${JSON.stringify(CAUSES)}, "summary": one short English sentence, "confidence": "high"|"medium"|"low", "evidence_urls": [links copied from the news list]}.
Only claim a cause the evidence supports. If nothing supports one, use "peak_hour" during weekday rush hours, otherwise "unknown". Never invent links.`;

const aiCache = new Map();
let aiDay = '';
let aiCalls = 0;

async function aiCause(inc, news, warnings, now) {
  const today = now.toISOString().slice(0, 10);
  if (today !== aiDay) [aiDay, aiCalls] = [today, 0];
  if (aiCalls >= AI_MAX_CALLS_PER_DAY) return null;
  aiCalls++;
  const input = {
    incident: {
      road: inc.roadNumbers,
      from: inc.from,
      to: inc.to,
      delaySeconds: inc.delay,
      lengthMeters: inc.length,
      events: inc.events,
    },
    news: news.slice(0, 30).map(({ title, link }) => ({ title, link })),
    warnings: warnings.filter((w) => w.regions.includes(inc.region)).map((w) => w.title),
    localTime: new Date(now.getTime() + 8 * 3600e3).toISOString().replace('Z', '+08:00'),
  };
  const res = await fetch(`${env.AI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(30e3),
    headers: {
      'content-type': 'application/json',
      ...(env.AI_API_KEY && { authorization: `Bearer ${env.AI_API_KEY}` }),
    },
    body: JSON.stringify({
      model: env.AI_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: AI_PROMPT },
        { role: 'user', content: JSON.stringify(input) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI endpoint returned ${res.status}`);
  const text = (await res.json()).choices?.[0]?.message?.content ?? '';
  return validateAi(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)), news);
}

// ---------- state + polling ----------

let history = null;

const state = {
  version,
  updatedAt: null,
  history: false,
  regions: REGIONS.map(({ id, name, group, bbox }) => ({ id, name, group, bbox, updatedAt: null })),
  traffic: Boolean(TOMTOM_KEY),
  ai: AI_ON,
  incidents: [],
  warnings: [],
  news: [],
  errors: {},
};

async function attempt(name, fn, fallback) {
  try {
    const r = await fn();
    delete state.errors[name];
    return r;
  } catch (e) {
    state.errors[name] = e.message;
    console.error(`[${name}]`, e.message);
    return fallback;
  }
}

let polling = false;
let contextAt = 0; // last news + weather fetch

// Runs every 30 s; only does work when a region or the news/weather is due.
async function poll() {
  if (polling) return;
  polling = true;
  try {
    const now = new Date();
    const due = TOMTOM_KEY ? dueRegions(REGIONS, now.getTime(), fetchedAt, watchedAt) : [];
    const contextDue = now - contextAt >= FAST_MS;
    if (!due.length && !contextDue) return;
    if (contextDue) contextAt = now.getTime();
    const [{ incidents, fresh }, warnings, news] = await Promise.all([
      fetchIncidents(due, state.incidents, now),
      contextDue ? attempt('weather', () => fetchWarnings(now), state.warnings) : state.warnings,
      contextDue ? attempt('news', () => fetchNews(now), state.news) : state.news,
    ]);
    for (const inc of incidents) {
      inc.label = roadLabel(inc);
      inc.at = midpoint(inc.geometry);
      inc.cause = causeOf(inc, news, warnings, now);
      if (!AI_ON || !['peak_hour', 'unknown'].includes(inc.cause.cause)) continue;
      if (!aiCache.has(inc.id)) {
        const r = await attempt('ai', () => aiCause(inc, news, warnings, now), null);
        if (r) aiCache.set(inc.id, r);
      }
      inc.cause = aiCache.get(inc.id) ?? inc.cause;
    }
    const live = new Set(incidents.map((i) => i.id));
    for (const id of aiCache.keys()) if (!live.has(id)) aiCache.delete(id);
    incidents.sort((a, b) => (b.delay ?? 0) - (a.delay ?? 0));
    Object.assign(state, { updatedAt: now.toISOString(), incidents, warnings, news });
    if (history && fresh.length) {
      await attempt(
        'history',
        () => {
          history.record(
            now.getTime(),
            fresh,
            incidents
              .filter((i) => fresh.includes(i.region))
              .map((i) => {
                const [lon, lat] = i.at;
                return {
                  id: i.id,
                  region: i.region,
                  road: i.label,
                  cause: i.cause.cause,
                  source: i.cause.source,
                  summary: i.cause.summary,
                  delay: i.delay,
                  lon,
                  lat,
                };
              }),
          );
          history.prune(now.getTime() - HISTORY_DAYS * DAY);
        },
        null,
      );
    }
    console.log(
      `${now.toISOString()} fetched=${due.map((r) => r.id).join(',') || '-'} incidents=${incidents.length} warnings=${warnings.length} news=${news.length} tomtomCallsToday=${tomtomCalls}`,
    );
  } finally {
    polling = false;
  }
}

// ---------- http ----------

function send(res, status, body, type = 'text/plain', cache = 'no-store') {
  res.writeHead(status, { 'content-type': type, 'cache-control': cache });
  res.end(body);
}

async function handle(req, res) {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');
  if (pathname === '/api/state') {
    // The page says which city it shows, so that city refreshes every few minutes (picked up by the next poll tick).
    const watch = searchParams.get('watch');
    if (REGIONS.some((r) => r.id === watch)) watchedAt.set(watch, Date.now());
    return send(res, 200, JSON.stringify(state), 'application/json');
  }

  if (pathname === '/api/history') {
    if (!history) return send(res, 503, 'History is off');
    const region = searchParams.get('region');
    if (!REGIONS.some((r) => r.id === region)) return send(res, 400, 'Unknown region');
    const days = Math.min(Math.max(Math.round(Number(searchParams.get('days')) || 7), 1), HISTORY_DAYS);
    return send(
      res,
      200,
      JSON.stringify({ region, days, ...history.query(region, Date.now() - days * DAY) }),
      'application/json',
    );
  }

  // Proxy flow tiles so the TomTom key stays on the server.
  // ponytail: no server-side tile cache; each browser view spends the 50k/day tile quota. Add an LRU if shared publicly.
  const tile = pathname.match(/^\/tiles\/flow\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})\.png$/);
  if (tile) {
    if (!TOMTOM_KEY) return send(res, 404, '');
    const [, z, x, y] = tile;
    const r = await fetch(
      `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/${z}/${x}/${y}.png?key=${TOMTOM_KEY}&tileSize=256`,
      { signal: AbortSignal.timeout(15e3) },
    );
    return send(res, r.status, Buffer.from(await r.arrayBuffer()), 'image/png', 'public, max-age=60');
  }

  if (pathname === '/') return send(res, 200, await fs.readFile(INDEX), 'text/html; charset=utf-8');
  send(res, 404, 'Not found');
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const port = Number(env.PORT) || 3000;
  const dbFile = path.resolve(ROOT, env.HISTORY_FILE || 'data/history.db');
  mkdirSync(path.dirname(dbFile), { recursive: true });
  history = openHistory(dbFile);
  state.history = true;
  http
    .createServer((req, res) =>
      handle(req, res).catch((e) => {
        console.error(e);
        if (!res.headersSent) send(res, 500, 'Server error');
      }),
    )
    .listen(port, () =>
      console.log(
        `Traffic Monitor v${version} on http://localhost:${port}${TOMTOM_KEY ? '' : ' (no TOMTOM_KEY: news + weather only)'}`,
      ),
    );
  poll();
  setInterval(poll, 30e3);
}
