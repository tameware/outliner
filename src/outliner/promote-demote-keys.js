/**
 * Toolbar Promote/Demote shortcuts (not Tab indent/outdent).
 * Promote → ⌘[ / Ctrl+[ / Alt+[
 * Demote  → ⌘] / Ctrl+] / Alt+]
 *
 * Always preventDefault when matched so the browser cannot treat ⌘[ as Back.
 */

import { isForeignMoveShortcutTarget } from './move-up-down-keys.js';

/**
 * @param {{ key?: string, metaKey?: boolean, ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean }} event
 * @returns {'promote' | 'demote' | null}
 */
export function matchPromoteDemoteShortcut(event) {
  // AltGr on many layouts sets ctrlKey+altKey together; do not steal [ / ].
  if (event.ctrlKey && event.altKey) return null;
  const mod = Boolean(event.metaKey || event.ctrlKey || event.altKey);
  if (!mod || event.shiftKey) return null;
  if (event.key === '[') return 'promote';
  if (event.key === ']') return 'demote';
  return null;
}

/**
 * @param {{ key?: string, metaKey?: boolean, ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean, target?: EventTarget | null, preventDefault?: () => void }} event
 * @param {{ run: (action: 'promote' | 'demote') => boolean, beep?: () => void, isReadOnly?: () => boolean }} options
 * @returns {boolean} true when the event was a promote/demote shortcut
 */
export function handlePromoteDemoteShortcut(event, { run, beep, isReadOnly }) {
  const action = matchPromoteDemoteShortcut(event);
  if (!action) return false;
  if (isForeignMoveShortcutTarget(event.target)) return false;
  event.preventDefault?.();
  if (isReadOnly?.()) {
    beep?.();
    return true;
  }
  if (!run(action)) beep?.();
  return true;
}
