/**
 * Clear outline plus multi-step undo/redo for structural restores (OPML snapshots).
 * Undo via Cmd/Ctrl+Z or Edit → Undo (beforeinput historyUndo);
 * redo via Shift+Cmd/Ctrl+Z, Cmd/Ctrl+Y, or Edit → Redo.
 */

const DEFAULT_MAX_DEPTH = 50;

/**
 * @param {object} options
 * @param {() => HTMLElement} options.getRoot
 * @param {typeof import('./outliner.js').toOpml} options.toOpml
 * @param {typeof import('./outliner.js').parseOpml} options.parseOpml
 * @param {typeof import('./outliner.js').loadOutline} options.loadOutline
 * @param {typeof import('./outliner.js').clearOutline} [options.clearOutline]
 * @param {() => string} [options.getTitle]
 * @param {HTMLButtonElement} [options.button] kept labelled "Clear outline" (never toggled)
 * @param {HTMLButtonElement | null} [options.undoButton]
 * @param {HTMLButtonElement | null} [options.redoButton]
 * @param {number} [options.maxDepth] max undo entries (oldest dropped); default 50
 */
export function createOutlineHistory({
  getRoot,
  toOpml,
  parseOpml,
  loadOutline,
  clearOutline,
  getTitle = () => 'Outline',
  button = null,
  undoButton = null,
  redoButton = null,
  maxDepth = DEFAULT_MAX_DEPTH,
}) {
  /** @type {string[]} */
  const undoStack = [];
  /** @type {string[]} */
  const redoStack = [];
  const depthLimit = Math.max(1, Number(maxDepth) || DEFAULT_MAX_DEPTH);

  if (button) {
    button.textContent = 'Clear outline';
    button.title = 'Remove all lines (⌘Z / Ctrl+Z to undo)';
  }

  function snapshot() {
    const root = getRoot();
    return toOpml(root, { title: getTitle() });
  }

  function restore(opml) {
    loadOutline(getRoot(), parseOpml(opml));
  }

  function trimUndo() {
    while (undoStack.length > depthLimit) undoStack.shift();
  }

  function syncButtons() {
    if (undoButton) undoButton.disabled = undoStack.length === 0;
    if (redoButton) redoButton.disabled = redoStack.length === 0;
  }

  function pushUndo(opml) {
    undoStack.push(opml);
    trimUndo();
    redoStack.length = 0;
    syncButtons();
  }

  /** Push current outline onto the undo stack (call before a structural mutation). */
  function record() {
    pushUndo(snapshot());
  }

  /**
   * Snapshot, run a mutation, and keep the snapshot only if the mutation reports success.
   * @param {() => boolean | void} mutate
   */
  function run(mutate) {
    const before = snapshot();
    const ok = mutate();
    if (ok) pushUndo(before);
    else syncButtons();
    return Boolean(ok);
  }

  function clear() {
    const root = getRoot();
    if (!root) return;
    const before = clearOutline
      ? clearOutline(root, { title: getTitle() })
      : (() => {
          const opml = snapshot();
          loadOutline(root, { items: [] });
          return opml;
        })();
    pushUndo(before);
  }

  function undo() {
    if (!undoStack.length) return false;
    redoStack.push(snapshot());
    restore(undoStack.pop());
    syncButtons();
    return true;
  }

  function redo() {
    if (!redoStack.length) return false;
    undoStack.push(snapshot());
    trimUndo();
    restore(redoStack.pop());
    syncButtons();
    return true;
  }

  function discard() {
    undoStack.length = 0;
    redoStack.length = 0;
    syncButtons();
  }

  /**
   * @param {EventTarget} target
   */
  function bindShortcuts(target) {
    if (!target?.addEventListener) return () => {};

    function onKeyDown(event) {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'y') {
        if (redo()) event.preventDefault();
        return;
      }
      if (key !== 'z') return;
      if (event.shiftKey) {
        if (redo()) event.preventDefault();
      } else if (undo()) {
        event.preventDefault();
      }
    }

    function onBeforeInput(event) {
      if (event.inputType === 'historyUndo') {
        if (undo()) event.preventDefault();
      } else if (event.inputType === 'historyRedo') {
        if (redo()) event.preventDefault();
      }
    }

    // Capture so we run before contenteditable's native undo when we have a snapshot.
    target.addEventListener('keydown', onKeyDown, true);
    target.addEventListener('beforeinput', onBeforeInput, true);
    return () => {
      target.removeEventListener('keydown', onKeyDown, true);
      target.removeEventListener('beforeinput', onBeforeInput, true);
    };
  }

  syncButtons();

  return {
    clear,
    record,
    run,
    undo,
    redo,
    discard,
    discardUndo: discard,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    undoDepth: () => undoStack.length,
    redoDepth: () => redoStack.length,
    syncButtons,
    bindShortcuts,
    // Back-compat alias used by older call sites
    clearOrUndo: clear,
  };
}

/** @deprecated use createOutlineHistory */
export function createClearOutlineControl(options) {
  return createOutlineHistory(options);
}
