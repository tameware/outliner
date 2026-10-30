/** Product / help menu for the Outliner app chrome. */

import { hasRemoteOutlineParams } from './deep-link-boot.js';

/** Display version: major.minor only. */
export const OUTLINER_VERSION = '1.64';

/** ISO date the shipped code was last updated (bump when shipping meaningful changes). */
export const OUTLINER_UPDATED = '2026-10-30';

export const OUTLINER_CHANGELOG_URL =
  'https://github.com/tameware/outliner/commits/main/';

export const OUTLINER_PRIVACY_URL = 'privacy.html';

/** Fresh app page with the baked-in starter outline (no ?id= / ?view= / ?edit=). */
export const OUTLINER_HELP_URL = 'index.html';

/** Top-level title of the baked-in starter / help outline. */
export const OUTLINER_HELP_TITLE = 'How to use this outliner';

export const OUTLINER_REPO_URL = 'https://github.com/tameware/outliner';

export const OUTLINER_ISSUES_MAILTO = 'mailto:outliner@tameware.com';

export const OUTLINER_ABOUT_TEXT =
  'Tameware Outliner is a WYSIWYG HTML outliner with expand/collapse editing, OPML import/export, optional Google Drive sync, and special features for bridge players. It was written by Adam Wildavsky using Cursor AI.';

/** @returns {string} */
export function outlinerVersionLabel() {
  return `${OUTLINER_VERSION} (updated ${OUTLINER_UPDATED})`;
}

/**
 * True when this window is already showing the starter how-to outline (not a
 * Drive/share deep link).
 * @param {Element | null | undefined} outlineRoot
 * @param {{ search?: string, hash?: string } | null | undefined} [locationLike]
 */
export function isDefaultHelpOutlineOpen(outlineRoot, locationLike) {
  const loc =
    locationLike ??
    (typeof window !== 'undefined' ? window.location : { search: '' });
  if (hasRemoteOutlineParams(loc)) return false;
  const text =
    outlineRoot
      ?.querySelector?.(':scope > [data-item] > .row .text')
      ?.textContent?.trim() ?? '';
  return text === OUTLINER_HELP_TITLE;
}

/** @type {WeakMap<HTMLElement, () => void>} */
const messageDialogOnClose = new WeakMap();

/**
 * @param {HTMLDialogElement | HTMLElement} dialog
 */
function closeMessageDialog(dialog) {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
  const onClose = messageDialogOnClose.get(dialog);
  messageDialogOnClose.delete(dialog);
  onClose?.();
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
 * @param {{ title: string, body: string, onClose?: () => void }} message
 */
export function showOutlinerMessage(dialog, { title, body, onClose }) {
  if (!dialog) return;
  ensureMessageDialogWired(dialog);
  const titleEl = dialog.querySelector('#outliner-message-title');
  const bodyEl = dialog.querySelector('#outliner-message-body');
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.textContent = body;
  if (typeof onClose === 'function') messageDialogOnClose.set(dialog, onClose);
  else messageDialogOnClose.delete(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  dialog.querySelector('#outliner-message-ok')?.focus?.();
}

/**
 * @param {ParentNode | null | undefined} root
 * @param {{
 *   open?: (url: string) => unknown,
 *   messageDialog?: HTMLDialogElement | HTMLElement | null,
 *   outlineRoot?: Element | null,
 *   getLocation?: () => { search?: string, hash?: string },
 *   restoreOutlineFocus?: () => void,
 * }} [deps]
 * @returns {{ syncHelpEnabled: () => void }}
 */
export function mountOutlinerMenu(root, deps = {}) {
  if (!root) return { syncHelpEnabled: () => {} };
  const openFn =
    deps.open || ((url) => window.open(url, '_blank', 'noopener,noreferrer'));
  const messageDialog =
    deps.messageDialog ??
    (typeof document !== 'undefined'
      ? document.getElementById('outliner-message-dialog')
      : null);
  const outlineRoot =
    deps.outlineRoot ??
    root.querySelector?.('[data-outline-root]') ??
    (typeof document !== 'undefined'
      ? document.querySelector('[data-outline-root]')
      : null);
  const getLocation =
    deps.getLocation ??
    (() => (typeof window !== 'undefined' ? window.location : { search: '' }));
  const restoreOutlineFocus = deps.restoreOutlineFocus;

  const help = root.querySelector('#menu-help');
  const about = root.querySelector('#menu-about');
  const version = root.querySelector('#menu-version');
  const changelog = root.querySelector('#menu-changelog');
  const openSource = root.querySelector('#menu-open-source');
  const report = root.querySelector('#menu-report-issues');
  const privacy = root.querySelector('#menu-privacy');

  function syncHelpEnabled() {
    if (!help) return;
    help.disabled = isDefaultHelpOutlineOpen(outlineRoot, getLocation());
  }

  function showMessage(title, body) {
    showOutlinerMessage(messageDialog, {
      title,
      body,
      onClose: restoreOutlineFocus,
    });
  }

  help?.addEventListener('click', () => {
    if (help.disabled) return;
    openFn(OUTLINER_HELP_URL);
  });
  about?.addEventListener('click', () =>
    showMessage('About', OUTLINER_ABOUT_TEXT),
  );
  version?.addEventListener('click', () =>
    showMessage('Version', outlinerVersionLabel()),
  );
  changelog?.addEventListener('click', () => openFn(OUTLINER_CHANGELOG_URL));
  openSource?.addEventListener('click', () => openFn(OUTLINER_REPO_URL));
  report?.addEventListener('click', () => openFn(OUTLINER_ISSUES_MAILTO));
  privacy?.addEventListener('click', () => openFn(OUTLINER_PRIVACY_URL));

  root
    .querySelector('[data-menu="outliner"] .menu-label')
    ?.addEventListener('click', syncHelpEnabled);
  syncHelpEnabled();

  return { syncHelpEnabled };
}
