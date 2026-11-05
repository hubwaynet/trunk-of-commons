// One quiet announcer per page, for screen readers (Jason, 2026-11-06). It speaks a short
// summary when the player needs to act, each result that matters, and messages that would
// otherwise appear only as toasts. Nothing else on the page is a live region, so nothing
// repeats on every bot move.
// SPDX-License-Identifier: AGPL-3.0-only

let region = null;
const ensure = () => {
  if (region?.isConnected) return region;
  region = document.createElement('div');
  region.className = 'sr-only';
  region.id = 'announcer';
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'true');
  document.body.append(region);
  return region;
};
// The region must exist before the first message, or some screen readers miss it.
if (typeof document !== 'undefined' && document.body) ensure();

let queue = [];
let timer = null;
/** Queue a sentence. Sentences sent together are spoken together, in order. */
export function announce(text) {
  if (!text) return;
  text = text.trim();
  queue.push(/[.!?…]$/.test(text) ? text : `${text}.`); // so sentences sent together don't run on
  clearTimeout(timer);
  timer = setTimeout(() => {
    const r = ensure();
    const msg = queue.join(' ');
    queue = [];
    r.textContent = ''; // so the same words twice are still spoken twice
    setTimeout(() => { r.textContent = msg; }, 30);
  }, 50);
}

/** Join names: "Moss", "Moss and Fig", "Moss, Fig and Reed". */
export const listNames = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
