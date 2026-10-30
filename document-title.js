/** Product tab title when no outline name is set. */
export const APP_DOCUMENT_TITLE = 'Tameware Outliner';

/** Label shown in chrome when the outline has no name yet. */
export const UNTITLED_DOCUMENT_TITLE = 'Untitled';

/** Trailing marker for unsaved changes (Mac-style document dirty). */
export const DIRTY_TITLE_SUFFIX = ' •';

/**
 * @param {string | null | undefined} title
 * @returns {string}
 */
export function stripDirtyTitleSuffix(title) {
  const value = String(title ?? '');
  return value.endsWith(DIRTY_TITLE_SUFFIX)
    ? value.slice(0, -DIRTY_TITLE_SUFFIX.length)
    : value;
}

/**
 * @param {string | null | undefined} title
 * @param {{ dirty?: boolean }} [options]
 * @returns {string}
 */
export function documentTitleLabel(title, options = {}) {
  const trimmed = stripDirtyTitleSuffix(title).trim();
  const base =
    !trimmed || trimmed === APP_DOCUMENT_TITLE
      ? UNTITLED_DOCUMENT_TITLE
      : trimmed;
  return options.dirty ? `${base}${DIRTY_TITLE_SUFFIX}` : base;
}

/**
 * @param {Element | null | undefined} el
 * @returns {boolean}
 */
function isEditingDocumentTitle(el) {
  if (!el || typeof document === 'undefined') return false;
  const active = document.activeElement;
  return active === el || Boolean(el.contains?.(active));
}

/**
 * @param {Element | null | undefined} el
 * @param {string | null | undefined} [title]
 * @param {{ dirty?: boolean, syncTabTitle?: boolean }} [options]
 */
export function syncDocumentTitleDisplay(el, title, options = {}) {
  const source =
    title !== undefined
      ? title
      : typeof document !== 'undefined'
        ? document.title
        : '';
  const labeled = documentTitleLabel(source, { dirty: Boolean(options.dirty) });
  if (el && !isEditingDocumentTitle(el)) el.textContent = labeled;
  if (options.syncTabTitle && typeof document !== 'undefined') {
    document.title = labeled;
  }
}

/**
 * Click-to-rename for the document name under the menubar.
 *
 * @param {HTMLElement | null | undefined} el
 * @param {{
 *   onCommit?: (title: string) => void,
 *   isReadOnly?: () => boolean,
 * }} [options]
 * @returns {() => void} unbind
 */
export function mountDocumentTitleEditor(el, options = {}) {
  if (!el) return () => {};

  const onCommit = options.onCommit;
  const isReadOnly = options.isReadOnly ?? (() => false);

  /** @type {string} */
  let editBaseline = '';
  let suppressCommit = false;

  function syncEditable() {
    const editable = !isReadOnly();
    if (editable) {
      el.setAttribute('contenteditable', 'plaintext-only');
      // Older engines reject plaintext-only; fall back to true.
      if (!el.isContentEditable) {
        el.setAttribute('contenteditable', 'true');
      }
    } else {
      el.setAttribute('contenteditable', 'false');
    }
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-label', 'Document name');
    el.spellcheck = false;
  }

  function selectAll() {
    const sel = window.getSelection?.();
    if (!sel || !el) return;
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      /* ignore */
    }
  }

  function onFocus() {
    if (isReadOnly()) {
      el.blur?.();
      return;
    }
    suppressCommit = false;
    editBaseline = stripDirtyTitleSuffix(el.textContent).trim() || UNTITLED_DOCUMENT_TITLE;
    el.textContent = editBaseline;
    selectAll();
  }

  function commitFromEditor() {
    const next =
      stripDirtyTitleSuffix(el.textContent).trim() || UNTITLED_DOCUMENT_TITLE;
    onCommit?.(next);
  }

  function onBlur() {
    if (suppressCommit || isReadOnly()) return;
    commitFromEditor();
  }

  function onKeyDown(event) {
    if (isReadOnly()) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      el.blur?.();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      suppressCommit = true;
      el.textContent = editBaseline;
      el.blur?.();
    }
  }

  syncEditable();
  el.addEventListener('focus', onFocus);
  el.addEventListener('blur', onBlur);
  el.addEventListener('keydown', onKeyDown);

  return () => {
    el.removeEventListener('focus', onFocus);
    el.removeEventListener('blur', onBlur);
    el.removeEventListener('keydown', onKeyDown);
  };
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
