// Alerts while Near me is on: an incident within the alert distance AHEAD of you
// (±60° of your heading; all around you when slower than 10 km/h), said once,
// and again only if it gets worse (becomes a closure, turns out to be an accident, or TomTom raises its severity).
import { bearing, angleBetween, nearestPoint } from './geo.js';

const AHEAD_DEG = 60;
const SLOW_KMH = 10;

// Which alert type an incident is ('accident' | 'closure' | 'works' | 'jam'), or null if it never alerts.
export function alertType(i, jamMinutes) {
  const c = i.cause.cause;
  if (c === 'accident') return 'accident';
  if (c === 'closure' || i.magnitudeOfDelay === 4) return 'closure';
  if (['roadworks', 'hazard', 'breakdown'].includes(c) || i.iconCategory === 11) return 'works'; // 11 = flooding
  if ((i.delay ?? 0) >= jamMinutes * 60) return 'jam';
  return null;
}

// Is `target` ahead of me? When slow or without a heading, everything around counts.
export function isAhead(me, target) {
  if ((me.speed ?? 0) * 3.6 < SLOW_KMH || me.heading == null) return true;
  return angleBetween(bearing(me, target), me.heading) <= AHEAD_DEG;
}

// What we remember about an incident when we alert, to tell later if it got worse.
const snapshot = (i) => ({
  closed: i.cause.cause === 'closure' || i.magnitudeOfDelay === 4,
  accident: i.cause.cause === 'accident',
  magnitude: i.magnitudeOfDelay ?? 0,
});
const worse = (was, now) =>
  (now.closed && !was.closed) || (now.accident && !was.accident) || now.magnitude > was.magnitude;

// New alerts for this position, using settings `s`. `alerted` (id -> snapshot) remembers what was said and is updated.
export function findAlerts(me, incidents, s, alerted) {
  const out = [];
  for (const i of incidents) {
    const type = alertType(i, s.jamMinutes);
    if (!type || !s.types[type]) continue;
    const near = nearestPoint(me, i.geometry);
    if (!near || near.distance > s.alertKm * 1000 || !isAhead(me, near)) continue;
    const now = snapshot(i);
    const was = alerted.get(i.id);
    if (was && !worse(was, now)) continue;
    alerted.set(i.id, now);
    out.push({ incident: i, type, metres: near.distance, again: Boolean(was) });
  }
  return out;
}

// ---------- Saying it ----------

const TEXT = {
  en: {
    accident: 'Accident',
    closure: 'Road closed',
    jam: 'Heavy traffic',
    works: 'Roadworks or hazard',
    again: 'Update: ',
    say: (what, km, road) => `${what} ${km} km ahead${road ? ` on ${road}` : ''}`,
  },
  ms: {
    accident: 'Kemalangan',
    closure: 'Jalan ditutup',
    jam: 'Kesesakan teruk',
    works: 'Kerja jalan atau bahaya',
    again: 'Kemas kini: ',
    say: (what, km, road) => `${what} ${km} km di hadapan${road ? ` di ${road}` : ''}`,
  },
  zh: {
    accident: '车祸',
    closure: '封路',
    jam: '严重塞车',
    works: '施工或危险路况',
    again: '更新：',
    say: (what, km, road) => `前方 ${km} 公里${road ? `，${road}` : ''}有${what}`,
  },
};
const SPEECH_LANG = { en: 'en-GB', ms: 'ms-MY', zh: 'zh-CN' };

// The alert language: the one picked in settings, or the phone's language (English if it isn't Malay or Chinese).
export function alertLang(s, phone = navigator.language) {
  if (s.voiceLang !== 'auto') return s.voiceLang;
  return phone.startsWith('zh') ? 'zh' : phone.startsWith('ms') ? 'ms' : 'en';
}

// "Accident 1.2 km ahead on E11 LDP"
export function message(a, lang) {
  const t = TEXT[lang];
  const road = a.incident.roadNumbers?.length ? a.incident.label : a.incident.from;
  return (a.again ? t.again : '') + t.say(t[a.type], (a.metres / 1000).toFixed(1), road);
}

// Tell the user in every way they turned on in settings.
export function notify(a, s) {
  const lang = alertLang(s);
  const text = message(a, lang);
  if (s.notify && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('Traffic Monitor', { body: text, tag: a.incident.id });
  }
  if (s.sound) beep();
  if (s.vibrate) navigator.vibrate?.([200, 100, 200]);
  if (s.voice && 'speechSynthesis' in window) {
    speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(text), { lang: SPEECH_LANG[lang] }));
  }
}

// Two short tones made with Web Audio, so no sound file is needed.
let audio = null;
function beep() {
  audio ??= new AudioContext();
  for (const [start, freq] of [
    [0, 880],
    [0.25, 660],
  ]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.2, audio.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + start + 0.2);
    osc.connect(gain).connect(audio.destination);
    osc.start(audio.currentTime + start);
    osc.stop(audio.currentTime + start + 0.2);
  }
}
