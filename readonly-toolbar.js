/** Menuitem ids kept enabled in read-only / shared view. */
export const READONLY_TOOLBAR_IDS = ['menu-expand-all', 'menu-collapse-all'];

/**
 * Keep File / Edit / View labels visible; disable editing actions.
 * @param {ParentNode | null | undefined} toolbar
 */
export function applyReadOnlyToolbar(toolbar) {
  if (!toolbar) return;
  const keep = new Set(READONLY_TOOLBAR_IDS);

  toolbar.querySelectorAll('.menu').forEach((menu) => {
    menu.hidden = false;
  });

  toolbar.querySelectorAll('[role="menuitem"]').forEach((btn) => {
    const allowed = keep.has(btn.id);
    btn.hidden = false;
    btn.disabled = !allowed;
  });
}
