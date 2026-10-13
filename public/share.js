// Share my live location: pick how long, get a link to send. Works only while Near me is on;
// turning Near me off ends the share. People with the link see only your position (share.html).
import { $ } from './util.js';
import { device } from './location.js';

let active = null; // { token, expires } while sharing

// Draw the share controls for the current Near me state.
export function renderShare(nearOn) {
  const box = $('share');
  box.hidden = !nearOn;
  if (!nearOn) active = null; // the server ended it when location was turned off
  if (!active) {
    box.innerHTML = `Share my location for
      <button data-min="15">15 min</button><button data-min="60">1 h</button>
      <button data-min="480">8 h</button><button data-min="">Until I stop</button>`;
    return;
  }
  const until = active.expires
    ? `until ${new Date(active.expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'until you stop';
  box.innerHTML = `Sharing ${until} · <button data-copy>Copy link</button> <button data-stop>Stop</button>`;
}

const link = () => `${location.origin}/share.html?t=${active.token}`;

$('share').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if ('min' in b.dataset) {
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device, minutes: b.dataset.min ? Number(b.dataset.min) : null }),
    });
    if (!res.ok) return alert(await res.text());
    active = await res.json();
    // Phones: open the share sheet. Elsewhere: copy the link.
    if (navigator.share) navigator.share({ title: 'My live location', url: link() }).catch(() => {});
    else navigator.clipboard?.writeText(link());
  } else if ('copy' in b.dataset) {
    await navigator.clipboard?.writeText(link());
    b.textContent = 'Copied';
    return;
  } else if ('stop' in b.dataset) {
    await fetch(`/api/share/${active.token}?device=${device}`, { method: 'DELETE' });
    active = null;
  }
  renderShare(true);
});
