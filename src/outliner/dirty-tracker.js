/**
 * Track whether the outline differs from the last clean (saved/loaded) snapshot.
 *
 * Prefer getContentSnapshot for dirty checks (text + structure only) and
 * getRevertSnapshot for the OPML restore baseline (may include expansionState).
 * Legacy callers may pass a single getSnapshot used for both.
 *
 * @param {{
 *   getSnapshot?: () => string,
 *   getContentSnapshot?: () => string,
 *   getRevertSnapshot?: () => string,
 * }} options
 */
export function createDirtyTracker(options) {
  const getContent = options.getContentSnapshot ?? options.getSnapshot;
  const getRevert = options.getRevertSnapshot ?? options.getSnapshot;
  if (typeof getContent !== 'function' || typeof getRevert !== 'function') {
    throw new Error(
      'createDirtyTracker requires getSnapshot or getContentSnapshot + getRevertSnapshot',
    );
  }

  let contentBaseline = getContent();
  let revertBaseline = getRevert();

  return {
    isDirty() {
      return getContent() !== contentBaseline;
    },
    markClean() {
      contentBaseline = getContent();
      revertBaseline = getRevert();
    },
    /** @returns {string} last clean OPML snapshot (for revert) */
    getBaseline() {
      return revertBaseline;
    },
  };
}
