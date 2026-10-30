/**
 * Edit → Move Up / Move Down shortcuts.
 * Move Up   → ⌘↑ / Ctrl+Up
 * Move Down → ⌘↓ / Ctrl+Down
 */

/**
 * True when focus is in a text field outside the outline (document name, Find).
 * @param {EventTarget | null | undefined} target
 */
export function isForeignMoveShortcutTarget(target) {
  const el = target?.nodeType === 1 ? target : target?.parentElement;
  if (!el?.closest) return false;
  if (el.closest('[data-outline-root]')) return false;
  if (el.closest('input, textarea, select')) return true;
  if (
    el.isContentEditable ||
    el.closest?.('[contenteditable=""], [contenteditable="true"]')
  ) {
    return true;
  }
  return false;
}

/**
 * @param {{ key?: string, code?: string, metaKey?: boolean, ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean }} event
 * @returns {'up' | 'down' | null}
 */
export function matchMoveUpDownShortcut(event) {
  const mod = Boolean(event.metaKey || event.ctrlKey);
  if (!mod || event.altKey || event.shiftKey) return null;
  const code = String(event.code || '');
  const key = String(event.key || '');
  if (code === 'ArrowUp' || key === 'ArrowUp' || key === 'Up') return 'up';
  if (code === 'ArrowDown' || key === 'ArrowDown' || key === 'Down') return 'down';
  return null;
}

/**
 * @param {{ key?: string, code?: string, metaKey?: boolean, ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean, target?: EventTarget | null, preventDefault?: () => void, stopPropagation?: () => void, stopImmediatePropagation?: () => void }} event
 * @param {{ run: (action: 'up' | 'down') => boolean, beep?: () => void, isReadOnly?: () => boolean }} options
 * @returns {boolean} true when the event was a move shortcut
 */
export function handleMoveUpDownShortcut(event, { run, beep, isReadOnly }) {
  const action = matchMoveUpDownShortcut(event);
  if (!action) return false;
  if (isForeignMoveShortcutTarget(event.target)) return false;
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
  if (isReadOnly?.()) {
    beep?.();
    return true;
  }
  if (!run(action)) beep?.();
  return true;
}
