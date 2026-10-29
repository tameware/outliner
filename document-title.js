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

/**
 * @param {Date | string | number | null | undefined} date
 * @returns {Date | null}
 */
export function coerceDocumentUpdatedAt(date) {
  if (date == null || date === '') return null;
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(+d) ? null : d;
}

/**
 * @param {Date | string | number | null | undefined} date
 * @returns {string}
 */
export function formatDocumentUpdatedLabel(date) {
  const d = coerceDocumentUpdatedAt(date);
  if (!d) return '';
  // dateStyle/timeStyle cannot combine with timeZoneName in some engines.
  return `Updated ${d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })}`;
}

/**
 * @param {HTMLElement | null | undefined} el
 * @param {Date | string | number | null | undefined} date
 */
export function syncDocumentUpdatedDisplay(el, date) {
  if (!el) return;
  const d = coerceDocumentUpdatedAt(date);
  const label = formatDocumentUpdatedLabel(d);
  el.textContent = label;
  el.hidden = !label;
  if (d) el.setAttribute('datetime', d.toISOString());
  else el.removeAttribute('datetime');
}
