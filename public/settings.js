// Settings, saved in this browser: alert methods and voice language, distances and thresholds,
// which incidents alert, and whether trips are recorded. Edited in the ⚙ dialog in index.html.
import { $, store } from './util.js';

const DEFAULTS = {
  notify: true, // system notification
  sound: true,
  vibrate: true,
  voice: true, // spoken alert
  voiceLang: 'auto', // 'auto' = the phone's language, or 'en' / 'ms' / 'zh'
  alertKm: 2, // alert when an incident ahead is this close
  jamMinutes: 10, // a jam this long counts as severe
  nearKm: 20, // "Near me" radius
  types: { accident: true, closure: true, jam: true, works: true }, // which incidents alert
  recordTrips: true,
};

export const settings = load();

function load() {
  try {
    const saved = JSON.parse(store.get('settings') ?? '{}');
    return { ...DEFAULTS, ...saved, types: { ...DEFAULTS.types, ...saved.types } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

// Form fields are named after setting paths, e.g. "alertKm" or "types.accident".
const get = (path) => path.split('.').reduce((o, k) => o[k], settings);
function set(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], settings)[last] = value;
}

const dialog = $('settings');
const form = dialog.querySelector('form');

// Open the dialog with the current values.
export function openSettings() {
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') el.checked = get(el.name);
    else el.value = get(el.name);
  }
  dialog.showModal();
}

// "Save" copies the form back into settings and stores them; "Cancel" just closes.
form.addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'save') return;
  for (const el of form.elements) {
    if (!el.name) continue;
    set(el.name, el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value);
  }
  store.set('settings', JSON.stringify(settings));
  form.dispatchEvent(new Event('saved'));
});

// Let app.js redraw when settings change (e.g. a new Near me radius).
export const onSettingsSaved = (fn) => form.addEventListener('saved', fn);
