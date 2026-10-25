/**
 * Clear outline plus multi-step undo/redo for structural restores (OPML snapshots).
 *
 * All undo/redo goes through undo()/redo() — Edit menu, Cmd/Ctrl+Z / Shift+Cmd/Ctrl+Z /
 * Cmd/Ctrl+Y, and contenteditable beforeinput historyUndo/historyRedo.
 *
 * Keyboard shortcuts listen on document so they still work after Edit-menu actions
 * leave focus on menu chrome (outside the outline root).
 *
 * Each stack entry stores the OPML snapshot and the focus to restore with it
 * (captured before the mutation for undo entries, so Enter/add returns to the prior line).
 */

const DEFAULT_MAX_DEPTH = 50;

/**
 * @typedef {{ itemIndex: number, caretOffset: number | null }} FocusSave
 * @typedef {{ opml: string, focus: FocusSave | null }} HistoryEntry
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
  /** @type {HistoryEntry[]} */
  const undoStack = [];
  /** @type {HistoryEntry[]} */
  const redoStack = [];
  const depthLimit = Math.max(1, Number(maxDepth) || DEFAULT_MAX_DEPTH);

  if (button) {
    button.title = 'Remove all lines (⌘Z / Ctrl+Z to undo)';
  }

  function snapshot() {
    const root = getRoot();
    return toOpml(root, { title: getTitle() });
  }

  /**
   * @param {HTMLElement | null | undefined} root
   * @returns {FocusSave | null}
   */
  function captureFocus(root) {
    if (!root) return null;
    const active = document.activeElement;
    if (!active || !root.contains(active)) return null;
    const item = active.closest?.('[data-item]');
    if (!item || !root.contains(item)) return null;
    const items = [...root.querySelectorAll('[data-item]')];
    const itemIndex = items.indexOf(item);
    if (itemIndex < 0) return null;
    let caretOffset = null;
    const text = item.querySelector('.text');
    const sel = window.getSelection?.();
    if (text && sel?.rangeCount) {
      const range = sel.getRangeAt(0);
      if (text === range.startContainer || text.contains(range.startContainer)) {
        caretOffset = range.startOffset;
      }
    }
    return { itemIndex, caretOffset };
  }

  /**
   * @param {HTMLElement | null | undefined} root
   * @param {FocusSave | null} saved
   */
  function restoreFocus(root, saved) {
    if (!root || !saved) return;
    const items = [...root.querySelectorAll('[data-item]')];
    const item = items[saved.itemIndex];
    if (!item) return;
    const text = item.querySelector('.text');
    if (!text) return;
    text.focus();
    if (saved.caretOffset == null || !window.getSelection) return;
    try {
      const node = text.firstChild || text;
      const max =
        node.nodeType === Node.TEXT_NODE
          ? node.textContent.length
          : node.childNodes.length;
      const range = document.createRange();
      range.setStart(node, Math.min(saved.caretOffset, max));
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      /* ignore */
    }
  }

  /**
   * @param {HistoryEntry | string} entry
   */
  function applyEntry(entry) {
    const root = getRoot();
    const opml = typeof entry === 'string' ? entry : entry.opml;
    const focus = typeof entry === 'string' ? captureFocus(root) : entry.focus;
    loadOutline(root, parseOpml(opml));
    restoreFocus(root, focus);
  }

  function trimUndo() {
    while (undoStack.length > depthLimit) undoStack.shift();
  }

  function syncButtons() {
    if (undoButton) undoButton.disabled = undoStack.length === 0;
    if (redoButton) redoButton.disabled = redoStack.length === 0;
  }

  /**
   * @param {string} opml
   * @param {FocusSave | null} [focus]
   */
  function pushUndo(opml, focus = null) {
    undoStack.push({ opml, focus });
    trimUndo();
    redoStack.length = 0;
    syncButtons();
  }

  /** Push current outline onto the undo stack (call before a structural mutation). */
  function record() {
    const root = getRoot();
    pushUndo(snapshot(), captureFocus(root));
  }

  /**
   * Snapshot, run a mutation, and keep the snapshot only if the mutation reports success.
   * Focus saved is the pre-mutation focus (so undoing Enter returns to the prior line).
   * @param {() => boolean | void} mutate
   */
  function run(mutate) {
    const root = getRoot();
    const before = snapshot();
    const focusBefore = captureFocus(root);
    const ok = mutate();
    if (ok) pushUndo(before, focusBefore);
    else syncButtons();
    return Boolean(ok);
  }

  function clear() {
    const root = getRoot();
    if (!root) return;
    const focusBefore = captureFocus(root);
    const before = clearOutline
      ? clearOutline(root, { title: getTitle() })
      : (() => {
          const opml = snapshot();
          loadOutline(root, { items: [] });
          return opml;
        })();
    pushUndo(before, focusBefore);
  }

  function undo() {
    if (!undoStack.length) return false;
    const root = getRoot();
    redoStack.push({ opml: snapshot(), focus: captureFocus(root) });
    applyEntry(undoStack.pop());
    syncButtons();
    return true;
  }

  function redo() {
    if (!redoStack.length) return false;
    const root = getRoot();
    undoStack.push({ opml: snapshot(), focus: captureFocus(root) });
    trimUndo();
    applyEntry(redoStack.pop());
    syncButtons();
    return true;
  }

  function discard() {
    undoStack.length = 0;
    redoStack.length = 0;
    syncButtons();
  }

  /**
   * True when focus is in a text field outside the outline (e.g. Save dialog),
   * so Cmd/Ctrl+Z should stay with the browser's native field undo.
   * @param {EventTarget | null} target
   */
  function isForeignEditable(target) {
    const el = target?.nodeType === 1 ? target : target?.parentElement;
    if (!el?.closest) return false;
    const outline = getRoot();
    if (outline?.contains(el)) return false;
    if (el.closest('input, textarea, select')) return true;
    if (el.isContentEditable) return true;
    return false;
  }

  /**
   * Bind Cmd/Ctrl+Z (and redo keys) on document; bind beforeinput on the outline root.
   * Menu Undo/Redo should call undo()/redo() directly — same functions as these shortcuts.
   *
   * @param {EventTarget | null | undefined} outlineRoot
   * @param {{ keyTarget?: EventTarget | null }} [options]
   */
  function bindShortcuts(outlineRoot, options = {}) {
    if (!outlineRoot?.addEventListener) return () => {};
    const keyTarget = options.keyTarget ?? outlineRoot.ownerDocument ?? document;
    if (!keyTarget?.addEventListener) return () => {};

    function onKeyDown(event) {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.altKey) return;
      if (isForeignEditable(event.target)) return;
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

    // Document capture: works even when focus is on menu chrome after Edit → Indent.
    // Outline beforeinput: intercepts contenteditable's native undo when focused in a line.
    keyTarget.addEventListener('keydown', onKeyDown, true);
    outlineRoot.addEventListener('beforeinput', onBeforeInput, true);
    return () => {
      keyTarget.removeEventListener('keydown', onKeyDown, true);
      outlineRoot.removeEventListener('beforeinput', onBeforeInput, true);
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
