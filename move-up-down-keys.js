/**
 * Edit → Move Up / Move Down shortcuts.
 * Move Up   → ⌥U / Alt+U
 * Move Down → ⌥D / Alt+D
 *
 * Match by `code` when present so Mac Option dead keys (¨ / ∂) still fire.
 */

/**
 * @param {{ key?: string, code?: string, metaKey?: boolean, ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean }} event
 * @returns {'up' | 'down' | null}
 */
export function matchMoveUpDownShortcut(event) {
  if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return null;
  const code = String(event.code || '');
  if (code === 'KeyU') return 'up';
  if (code === 'KeyD') return 'down';
  const key = String(event.key || '').toLowerCase();
  if (key === 'u') return 'up';
  if (key === 'd') return 'down';
  return null;
}

/**
 * @param {{ key?: string, code?: string, metaKey?: boolean, ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean, preventDefault?: () => void }} event
 * @param {{ run: (action: 'up' | 'down') => boolean, beep?: () => void, isReadOnly?: () => boolean }} options
 * @returns {boolean} true when the event was a move shortcut
 */
export function handleMoveUpDownShortcut(event, { run, beep, isReadOnly }) {
  const action = matchMoveUpDownShortcut(event);
  if (!action) return false;
  event.preventDefault?.();
  if (isReadOnly?.()) {
    beep?.();
    return true;
  }
  if (!run(action)) beep?.();
  return true;
}
