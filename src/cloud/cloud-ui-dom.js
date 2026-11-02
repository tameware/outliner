/**
 * Tiny HTMLDialogElement helpers shared by Cloud and chrome dialogs.
 */

/**
 * @param {HTMLDialogElement | HTMLElement | null | undefined} el
 */
export function closeDialog(el) {
  if (el?.close) el.close();
  else if (el) el.removeAttribute('open');
}

/**
 * @param {HTMLDialogElement | HTMLElement | null | undefined} el
 */
export function openDialogEl(el) {
  if (el?.showModal) el.showModal();
  else if (el) el.setAttribute('open', '');
}

/**
 * @param {HTMLDialogElement | HTMLElement | null | undefined} el
 * @returns {boolean}
 */
export function isDialogOpen(el) {
  if (!el) return false;
  // Prefer the attribute: JSDOM dialog mocks often setAttribute without syncing .open.
  if (el.hasAttribute?.('open')) return true;
  return el.open === true;
}

/**
 * Escape or Cmd/Ctrl+. dismisses an open dialog (classic Mac cancel).
 *
 * @param {HTMLDialogElement | HTMLElement | null | undefined} dialog
 * @param {{ onDismiss?: () => void }} [options]
 * @returns {() => void} unbind
 */
export function bindDialogDismissKeys(dialog, options = {}) {
  if (!dialog?.addEventListener) return () => {};
  const onDismiss = options.onDismiss ?? (() => closeDialog(dialog));

  function onKeyDown(event) {
    if (!isDialogOpen(dialog)) return;
    const mod = event.metaKey || event.ctrlKey;
    if (event.key !== 'Escape' && !(mod && event.key === '.')) return;
    event.preventDefault();
    event.stopPropagation();
    onDismiss();
  }

  dialog.addEventListener('keydown', onKeyDown);
  return () => dialog.removeEventListener('keydown', onKeyDown);
}
