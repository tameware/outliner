/**
 * Revert the outline to the last clean (saved/loaded) snapshot.
 */

/**
 * @param {object} options
 * @param {() => boolean} options.isDirty
 * @param {() => string} options.getBaseline
 * @param {() => HTMLElement} options.getRoot
 * @param {typeof import('./outliner.js').parseOpml} options.parseOpml
 * @param {typeof import('./outliner.js').loadOutline} options.loadOutline
 * @param {(title: string) => void} [options.setTitle]
 * @param {(mutate: () => boolean | void) => boolean} options.run history.run
 * @returns {boolean} true when a revert was recorded
 */
export function revertToCleanSnapshot({
  isDirty,
  getBaseline,
  getRoot,
  parseOpml,
  loadOutline,
  setTitle,
  run,
}) {
  if (!isDirty()) return false;
  return run(() => {
    const tree = parseOpml(getBaseline());
    loadOutline(getRoot(), tree);
    if (tree.title && setTitle) setTitle(tree.title);
    return true;
  });
}

/**
 * @param {HTMLButtonElement | null | undefined} button
 * @param {() => boolean} isDirty
 */
export function syncRevertMenuItem(button, isDirty) {
  if (!button) return;
  button.disabled = !isDirty();
}
