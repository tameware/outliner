/**
 * Track whether the outline differs from the last clean (saved/loaded) snapshot.
 * @param {{ getSnapshot: () => string }} options
 */
export function createDirtyTracker({ getSnapshot }) {
  let baseline = getSnapshot();

  return {
    isDirty() {
      return getSnapshot() !== baseline;
    },
    markClean() {
      baseline = getSnapshot();
    },
    /** @returns {string} last clean OPML snapshot */
    getBaseline() {
      return baseline;
    },
  };
}
