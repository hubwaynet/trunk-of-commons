// Keep keyboard focus when a page section is rebuilt. Both games redraw their panels from
// scratch, which used to drop focus to the top of the page after every key press.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Run redraw(), then put focus back on the control that had it (matched by id). If that control
 * is gone or disabled, focus the region it was in (one of regionIds) so Tab carries on from there.
 */
export function keepFocus(redraw, regionIds = []) {
  const was = document.activeElement;
  const id = was && was !== document.body ? was.id : '';
  const region = regionIds.map((r) => document.getElementById(r)).find((r) => r && was && r.contains(was) && r !== was);
  redraw();
  if (!id && !region) return;
  const now = id ? document.getElementById(id) : null;
  if (now && !now.disabled) {
    if (now !== document.activeElement) now.focus({ preventScroll: true });
    return;
  }
  if (region && region.isConnected && !region.contains(document.activeElement)) {
    if (!region.hasAttribute('tabindex')) region.setAttribute('tabindex', '-1');
    region.focus({ preventScroll: true });
  }
}
