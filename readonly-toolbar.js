/** Menu roots that remain available in read-only / shared view. */
export const READONLY_MENU_NAMES = ['view'];

/** Menuitem ids kept enabled inside the View menu when read-only. */
export const READONLY_TOOLBAR_IDS = ['menu-expand-all', 'menu-collapse-all'];

/**
 * Hide File/Edit menus; keep View → Expand/Collapse.
 * @param {ParentNode | null | undefined} toolbar
 */
export function applyReadOnlyToolbar(toolbar) {
  if (!toolbar) return;
  const keepMenus = new Set(READONLY_MENU_NAMES);
  const keepItems = new Set(READONLY_TOOLBAR_IDS);

  toolbar.querySelectorAll('details.menu').forEach((menu) => {
    const name = menu.getAttribute('data-menu');
    menu.hidden = !keepMenus.has(name);
  });

  toolbar.querySelectorAll('[role="menuitem"]').forEach((btn) => {
    const keep = keepItems.has(btn.id);
    btn.hidden = !keep;
    if (keep) btn.disabled = false;
  });
}
