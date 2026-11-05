// Player progress shared across the games, stored in this browser: permanent level unlocks
// and a "Reset achievements" control. Unlocks survive a reset, so resetting Rising Pool
// never locks Centipede & Ultimatum again (Jason, 2026-11-05).
// SPDX-License-Identifier: AGPL-3.0-only

export const UNLOCK_KEYS = {
  centipede: 'trunk.unlocked.centipede', // earned by all five Rising Pool achievements
  wheel: 'trunk.unlocked.wheel', // earned by all six Centipede & Ultimatum achievements
};

export function isUnlocked(level) {
  try { return localStorage.getItem(UNLOCK_KEYS[level]) === '1'; } catch { return false; }
}
export function unlock(level) {
  try { localStorage.setItem(UNLOCK_KEYS[level], '1'); } catch { /* storage unavailable */ }
}

const pending = {}; // which games are showing the "are you sure?" step, kept across re-renders

/**
 * A small Reset control with its own confirmation step (browser dialogs are unavailable in
 * artifacts). keys: localStorage keys to clear. Call render() again after onReset.
 */
export function resetControl({ game, keys, count, onChange }) {
  const wrap = document.createElement('span');
  wrap.className = 'reset-ach';
  if (!count && !pending[game]) return wrap;
  if (!pending[game]) {
    wrap.innerHTML = '<button type="button" class="linkish">Reset</button>';
    wrap.firstElementChild.addEventListener('click', () => { pending[game] = true; onChange(); });
    return wrap;
  }
  wrap.innerHTML = `<span class="small">Clear all ${count} achievement${count === 1 ? '' : 's'}? Levels you've unlocked stay open.</span>
    <button type="button" class="linkish danger" data-yes>Yes, reset</button> <button type="button" class="linkish" data-no>Cancel</button>`;
  wrap.querySelector('[data-yes]').addEventListener('click', () => {
    for (const k of keys) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } }
    pending[game] = false;
    onChange(true);
  });
  wrap.querySelector('[data-no]').addEventListener('click', () => { pending[game] = false; onChange(); });
  return wrap;
}
