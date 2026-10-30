/**
 * Edit → Move Up / Move Down shortcuts.
 * Move Up   → ⌘↑ / Ctrl+Up
 * Move Down → ⌘↓ / Ctrl+Down
 */

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
 * @param {{ key?: string, code?: string, metaKey?: boolean, ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean, preventDefault?: () => void, stopPropagation?: () => void, stopImmediatePropagation?: () => void }} event
 * @param {{ run: (action: 'up' | 'down') => boolean, beep?: () => void, isReadOnly?: () => boolean }} options
 * @returns {boolean} true when the event was a move shortcut
 */
export function handleMoveUpDownShortcut(event, { run, beep, isReadOnly }) {
  const action = matchMoveUpDownShortcut(event);
  if (!action) return false;
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
