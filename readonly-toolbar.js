/** Menuitem ids kept enabled in read-only / shared view. */
export const READONLY_TOOLBAR_IDS = [
  'menu-help',
  'menu-about',
  'menu-version',
  'menu-changelog',
  'menu-open-source',
  'menu-issue-tracker',
  'menu-report-issues',
  'menu-privacy',
  'menu-cookies',
  'menu-file-save',
  'menu-file-save-as',
  'menu-find',
  'menu-focus',
  'menu-unfocus',
  'menu-expand-all',
  'menu-collapse-all',
];

/**
 * Keep Outliner / File / Edit / View labels visible; disable editing actions.
 * Cloud stays hidden (owner-only sign-in / share links).
 * @param {ParentNode | null | undefined} toolbar
 */
export function applyReadOnlyToolbar(toolbar) {
  if (!toolbar) return;
  const keep = new Set(READONLY_TOOLBAR_IDS);

  toolbar.querySelectorAll('.menu').forEach((menu) => {
    if (menu.getAttribute('data-menu') === 'cloud') {
      menu.hidden = true;
      return;
    }
    menu.hidden = false;
  });

  toolbar.querySelectorAll('[role="menuitem"]').forEach((btn) => {
    if (btn.closest('[data-menu="cloud"]')) {
      btn.disabled = true;
      return;
    }
    const allowed = keep.has(btn.id);
    btn.hidden = false;
    btn.disabled = !allowed;
  });
}
