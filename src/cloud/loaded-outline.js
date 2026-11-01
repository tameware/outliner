/**
 * Pure helpers for applying Cloud Open / deep-link loads into the document.
 */

/**
 * @param {{ dateModified?: Date | string | number | null }} tree
 * @returns {Date | string | number | null}
 */
export function cloudOpenUpdatedAt(tree) {
  return tree?.dateModified ?? null;
}

/**
 * @param {{ title?: string | null }} got
 * @param {{ title?: string | null }} tree
 * @param {(fileTitle: string | null | undefined, opmlTitle: string | null | undefined) => string | null | undefined} outlineTitleFromFileName
 */
export function deepLinkDocumentTitle(got, tree, outlineTitleFromFileName) {
  return outlineTitleFromFileName(got?.title, tree?.title);
}

/**
 * Cloud Open may have moved on while a deep-link fetch was still in flight.
 * @param {{
 *   shareMode?: boolean,
 *   requestedId?: string | null,
 *   currentOutlineId?: string | null,
 * }} opts
 */
export function shouldIgnoreStaleDeepLink({
  shareMode = false,
  requestedId = null,
  currentOutlineId = null,
} = {}) {
  if (shareMode) return false;
  return Boolean(
    requestedId && currentOutlineId && currentOutlineId !== requestedId,
  );
}

/**
 * Whether to rewrite the owner bookmark (?id=) after a deep-link resolve.
 * Opaque ?view= / ?edit= share URLs always keep syncUrl's no-op rewrite path.
 * @param {{
 *   shareMode?: boolean,
 *   fileId?: string | null,
 *   requestedId?: string | null,
 *   currentOutlineId?: string | null,
 * }} opts
 */
export function shouldSyncOwnerUrlAfterDeepLink({
  shareMode = false,
  fileId = null,
  requestedId = null,
  currentOutlineId = null,
} = {}) {
  if (!fileId) return false;
  if (shareMode) return true;
  return (
    !currentOutlineId ||
    currentOutlineId === requestedId ||
    currentOutlineId === fileId
  );
}
