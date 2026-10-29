/** Product / help menu for the Outliner app chrome. */

/** Display version: major.minor only. */
export const OUTLINER_VERSION = '1.32';

/** ISO date the shipped code was last updated (bump when shipping meaningful changes). */
export const OUTLINER_UPDATED = '2026-10-29';

export const OUTLINER_CHANGELOG_URL = 'changelog.html';

export const OUTLINER_PRIVACY_URL = 'privacy.html';

export const OUTLINER_REPO_URL = 'https://github.com/tameware/outliner';

export const OUTLINER_ISSUES_MAILTO = 'mailto:outliner@tameware.com';

export const OUTLINER_ABOUT_TEXT =
  'Tameware Outliner is a WYSIWYG HTML outliner with expand/collapse editing, OPML import/export, optional Google Drive sync, and special features for bridge players. It was written by Adam Wildavsky using Cursor AI.';

/** @returns {string} */
export function outlinerVersionLabel() {
  return `${OUTLINER_VERSION} (updated ${OUTLINER_UPDATED})`;
}

/**
 * @param {HTMLDialogElement | HTMLElement} dialog
 */
function closeMessageDialog(dialog) {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

/**
 * Wire OK / Escape once so the dialog closes in embeds where method=dialog is weak.
 * @param {HTMLDialogElement | HTMLElement | null | undefined} dialog
 */
function ensureMessageDialogWired(dialog) {
  if (!dialog || dialog.dataset.outlinerMessageWired === '1') return;
  dialog.dataset.outlinerMessageWired = '1';
  dialog.querySelector('#outliner-message-ok')?.addEventListener('click', (event) => {
    event.preventDefault();
    closeMessageDialog(dialog);
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeMessageDialog(dialog);
  });
}

/**
 * Show a short message in an in-app dialog (works where window.alert is blocked).
 * @param {HTMLDialogElement | HTMLElement | null | undefined} dialog
 * @param {{ title: string, body: string }} message
 */
export function showOutlinerMessage(dialog, { title, body }) {
  if (!dialog) return;
  ensureMessageDialogWired(dialog);
  const titleEl = dialog.querySelector('#outliner-message-title');
  const bodyEl = dialog.querySelector('#outliner-message-body');
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.textContent = body;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  dialog.querySelector('#outliner-message-ok')?.focus?.();
}

/**
 * @param {ParentNode | null | undefined} root
 * @param {{
 *   open?: (url: string) => unknown,
 *   messageDialog?: HTMLDialogElement | HTMLElement | null,
 * }} [deps]
 */
export function mountOutlinerMenu(root, deps = {}) {
  if (!root) return;
  const openFn =
    deps.open || ((url) => window.open(url, '_blank', 'noopener,noreferrer'));
  const messageDialog =
    deps.messageDialog ??
    (typeof document !== 'undefined'
      ? document.getElementById('outliner-message-dialog')
      : null);

  const about = root.querySelector('#menu-about');
  const version = root.querySelector('#menu-version');
  const changelog = root.querySelector('#menu-changelog');
  const openSource = root.querySelector('#menu-open-source');
  const report = root.querySelector('#menu-report-issues');
  const privacy = root.querySelector('#menu-privacy');

  about?.addEventListener('click', () =>
    showOutlinerMessage(messageDialog, {
      title: 'About',
      body: OUTLINER_ABOUT_TEXT,
    }),
  );
  version?.addEventListener('click', () =>
    showOutlinerMessage(messageDialog, {
      title: 'Version',
      body: outlinerVersionLabel(),
    }),
  );
  changelog?.addEventListener('click', () => openFn(OUTLINER_CHANGELOG_URL));
  openSource?.addEventListener('click', () => openFn(OUTLINER_REPO_URL));
  report?.addEventListener('click', () => openFn(OUTLINER_ISSUES_MAILTO));
  privacy?.addEventListener('click', () => openFn(OUTLINER_PRIVACY_URL));
}
