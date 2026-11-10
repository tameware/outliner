/** Menuitem ids kept enabled in read-only / shared view. */
export const READONLY_TOOLBAR_IDS = [
  'menu-help',
  'menu-about',
  'menu-version',
  'menu-changelog',
  'menu-open-source',
  'menu-issue-tracker',
  'menu-forum',
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
  'menu-render-pbn',
];

/** Status label shown in the chrome meta bar while viewing read-only. */
export const READONLY_STATUS_LABEL = 'Read-only view';

/**
 * Unhide the chrome status bar and show the read-only label.
 * @param {Document | ParentNode | null | undefined} root
 */
export function showReadOnlyStatus(root) {
  const doc =
    root && typeof root.getElementById === 'function'
      ? root
      : root?.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;
  const bar = doc.querySelector?.('[data-cloud-bar]');
  const status = doc.getElementById?.('cloud-status');
  if (bar) bar.hidden = false;
  if (status) status.textContent = READONLY_STATUS_LABEL;
}

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

  showReadOnlyStatus(toolbar);
}
