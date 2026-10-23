/**
 * Toolbar Promote/Demote shortcuts (not Tab indent/outdent).
 * Promote → ⌘] / Ctrl+]
 * Demote  → ⌘[ / Ctrl+[
 *
 * @param {{ key?: string, metaKey?: boolean, ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean }} event
 * @returns {'promote' | 'demote' | null}
 */
export function matchPromoteDemoteShortcut(event) {
  const mod = Boolean(event.metaKey || event.ctrlKey);
  if (!mod || event.shiftKey || event.altKey) return null;
  if (event.key === ']') return 'promote';
  if (event.key === '[') return 'demote';
  return null;
}
