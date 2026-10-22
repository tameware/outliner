/**
 * Toolbar control: Clear outline ↔ Undo clear (one-shot undo of the last clear).
 *
 * @param {object} options
 * @param {() => HTMLElement} options.getRoot
 * @param {HTMLButtonElement} options.button
 * @param {typeof import('./outliner.js').toOpml} options.toOpml
 * @param {typeof import('./outliner.js').parseOpml} options.parseOpml
 * @param {typeof import('./outliner.js').loadOutline} options.loadOutline
 * @param {typeof import('./outliner.js').clearOutline} [options.clearOutline]
 * @param {() => string} [options.getTitle]
 */
export function createClearOutlineControl({
  getRoot,
  button,
  toOpml,
  parseOpml,
  loadOutline,
  clearOutline,
  getTitle = () => 'Outline',
}) {
  let undoOpml = null;

  function syncLabel() {
    if (!button) return;
    button.textContent = undoOpml ? 'Undo clear' : 'Clear outline';
    button.title = undoOpml
      ? 'Restore the outline from before clear'
      : 'Remove all lines (can undo once)';
  }

  function clearOrUndo() {
    const root = getRoot();
    if (!root) return;
    if (undoOpml) {
      const tree = parseOpml(undoOpml);
      loadOutline(root, tree);
      undoOpml = null;
    } else if (clearOutline) {
      undoOpml = clearOutline(root, { title: getTitle() });
    } else {
      undoOpml = toOpml(root, { title: getTitle() });
      loadOutline(root, { items: [] });
    }
    syncLabel();
  }

  /** Drop pending undo (e.g. after opening a file). */
  function discardUndo() {
    undoOpml = null;
    syncLabel();
  }

  syncLabel();

  return {
    clearOrUndo,
    discardUndo,
    canUndo: () => Boolean(undoOpml),
  };
}
