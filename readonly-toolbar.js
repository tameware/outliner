/** Toolbar button ids that remain available in read-only / shared view. */
export const READONLY_TOOLBAR_IDS = ['btn-expand-all', 'btn-collapse-all'];

/**
 * Hide editing toolbar actions; keep expand/collapse visible.
 * @param {ParentNode | null | undefined} toolbar
 */
export function applyReadOnlyToolbar(toolbar) {
  if (!toolbar) return;
  const keep = new Set(READONLY_TOOLBAR_IDS);
  toolbar.querySelectorAll('button').forEach((btn) => {
    btn.hidden = !keep.has(btn.id);
    if (keep.has(btn.id)) btn.disabled = false;
  });
}
