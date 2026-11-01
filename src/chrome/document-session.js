import {
  documentTitleLabel,
  stripDirtyTitleSuffix,
  syncDocumentTitleDisplay,
  syncDocumentUpdatedDisplay,
  coerceDocumentUpdatedAt,
  UNTITLED_DOCUMENT_TITLE,
} from './document-title.js';

/**
 * Chrome document name + Updated timestamp state shared by File, Cloud, and history.
 *
 * @param {{
 *   titleEl?: HTMLElement | null,
 *   updatedEl?: HTMLElement | null,
 *   isDirty?: () => boolean,
 *   isLoading?: () => boolean,
 * }} [options]
 */
export function createDocumentSession(options = {}) {
  const titleEl = options.titleEl ?? null;
  const updatedEl = options.updatedEl ?? null;
  const isDirty = options.isDirty ?? (() => false);
  const isLoading = options.isLoading ?? (() => false);

  /** @type {Date | null} */
  let documentUpdatedAt = null;

  /** Title last bound to the open local handle / Drive file (Save As when chrome renames). */
  let boundDocumentTitle = '';

  function outlineTitleBase() {
    return documentTitleLabel(stripDirtyTitleSuffix(document.title));
  }

  /**
   * @param {string | null | undefined} [title]
   */
  function rememberBoundTitle(title = outlineTitleBase()) {
    boundDocumentTitle =
      stripDirtyTitleSuffix(String(title ?? '')).trim() || UNTITLED_DOCUMENT_TITLE;
  }

  function getBoundTitle() {
    return boundDocumentTitle;
  }

  function syncDocumentTitles() {
    // Share / deep-link opens: keep the heading blank until the real name arrives.
    if (isLoading()) {
      if (titleEl) titleEl.textContent = '';
      return;
    }
    syncDocumentTitleDisplay(titleEl, outlineTitleBase(), {
      dirty: isDirty(),
      syncTabTitle: true,
    });
  }

  /**
   * @param {string | null | undefined} title
   */
  function applyDocumentTitle(title) {
    const next = stripDirtyTitleSuffix(String(title ?? '')).trim();
    if (next) document.title = documentTitleLabel(next);
    syncDocumentTitles();
  }

  /**
   * @param {Date | string | number | null | undefined} date
   */
  function applyDocumentUpdated(date) {
    documentUpdatedAt = coerceDocumentUpdatedAt(date);
    syncDocumentUpdatedDisplay(updatedEl, documentUpdatedAt);
  }

  function getUpdatedAt() {
    return documentUpdatedAt;
  }

  return {
    outlineTitleBase,
    rememberBoundTitle,
    getBoundTitle,
    syncDocumentTitles,
    applyDocumentTitle,
    applyDocumentUpdated,
    getUpdatedAt,
  };
}
