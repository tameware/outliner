/**
 * Clear outline plus undo/redo history for structural restores (OPML snapshots).
 * Undo via Cmd/Ctrl+Z or Edit → Undo (beforeinput historyUndo); redo via Shift+Cmd/Ctrl+Z.
 */

/**
 * @param {object} options
 * @param {() => HTMLElement} options.getRoot
 * @param {typeof import('./outliner.js').toOpml} options.toOpml
 * @param {typeof import('./outliner.js').parseOpml} options.parseOpml
 * @param {typeof import('./outliner.js').loadOutline} options.loadOutline
 * @param {typeof import('./outliner.js').clearOutline} [options.clearOutline]
 * @param {() => string} [options.getTitle]
 * @param {HTMLButtonElement} [options.button] kept labelled "Clear outline" (never toggled)
 */
export function createOutlineHistory({
  getRoot,
  toOpml,
  parseOpml,
  loadOutline,
  clearOutline,
  getTitle = () => 'Outline',
  button = null,
}) {
  /** @type {string[]} */
  const undoStack = [];
  /** @type {string[]} */
  const redoStack = [];

  if (button) {
    button.textContent = 'Clear outline';
    button.title = 'Remove all lines (undo with ⌘Z / Ctrl+Z)';
  }

  function snapshot() {
    const root = getRoot();
    return toOpml(root, { title: getTitle() });
  }

  function restore(opml) {
    loadOutline(getRoot(), parseOpml(opml));
  }

  /** Push current outline onto the undo stack (call before a structural mutation). */
  function record() {
    undoStack.push(snapshot());
    redoStack.length = 0;
  }

  /**
   * Snapshot, run a mutation, and keep the snapshot only if the mutation reports success.
   * @param {() => boolean | void} mutate
   */
  function run(mutate) {
    const before = snapshot();
    const ok = mutate();
    if (ok) {
      undoStack.push(before);
      redoStack.length = 0;
    }
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
    undoStack.push(before);
    redoStack.length = 0;
  }

  function undo() {
    if (!undoStack.length) return false;
    redoStack.push(snapshot());
    restore(undoStack.pop());
    return true;
  }

  function redo() {
    if (!redoStack.length) return false;
    undoStack.push(snapshot());
    restore(redoStack.pop());
    return true;
  }

  function discard() {
    undoStack.length = 0;
    redoStack.length = 0;
  }

  /**
   * @param {EventTarget} target
   */
  function bindShortcuts(target) {
    if (!target?.addEventListener) return () => {};

    function onKeyDown(event) {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.key.toLowerCase() !== 'z') return;
      if (event.altKey) return;
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
    bindShortcuts,
    // Back-compat alias used by older call sites
    clearOrUndo: clear,
  };
}

/** @deprecated use createOutlineHistory */
export function createClearOutlineControl(options) {
  return createOutlineHistory(options);
}
