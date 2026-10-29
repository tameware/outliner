/** Product tab title when no outline name is set. */
export const APP_DOCUMENT_TITLE = 'Tameware Outliner';

/** Label shown in chrome when the outline has no name yet. */
export const UNTITLED_DOCUMENT_TITLE = 'Untitled';

/**
 * @param {string | null | undefined} title
 * @returns {string}
 */
export function documentTitleLabel(title) {
  const trimmed = String(title ?? '').trim();
  if (!trimmed || trimmed === APP_DOCUMENT_TITLE) return UNTITLED_DOCUMENT_TITLE;
  return trimmed;
}

/**
 * @param {Element | null | undefined} el
 * @param {string | null | undefined} [title]
 */
export function syncDocumentTitleDisplay(el, title) {
  if (!el) return;
  const source =
    title !== undefined ? title : typeof document !== 'undefined' ? document.title : '';
  el.textContent = documentTitleLabel(source);
}
