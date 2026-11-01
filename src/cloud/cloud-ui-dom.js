/**
 * Tiny HTMLDialogElement helpers shared by Cloud dialogs.
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
