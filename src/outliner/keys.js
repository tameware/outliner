/**
 * Outline keyboard handling (Enter/Tab/Backspace/arrows/⌘←⌘→).
 */

import { tryInsertSuitShortcut } from './suit-shortcuts.js';
import { isForeignMoveShortcutTarget } from './move-up-down.js';
import {
  textEl,
  hasChildren,
  isExpanded,
  toggleItem,
  expandItemFully,
  collapseItemFully,
  addItemBelow,
  demoteItem,
  promoteItem,
  mergeWithPreviousLine,
  focusSameLevelSibling,
  focusAdjacentItem,
  isReadOnly,
} from './model.js';

export function itemFromEventTarget(target) {
  return target?.closest?.('[data-item]') ?? null;
}

/**
 * Resolve the editing line for a key event. Prefer activeElement so Text-node
 * targets (common in contenteditable) still map to the `.text` line.
 * @param {Event} event
 */
function textLineFromEvent(event) {
  const active = document.activeElement;
  if (active?.closest) {
    const fromActive = active.closest('.text');
    if (fromActive) return fromActive;
  }
  let t = event.target;
  if (t?.nodeType === Node.TEXT_NODE) t = t.parentElement;
  return t?.closest?.('.text') ?? null;
}

/**
 * Outline item for a key event when there may be no caret in `.text`
 * (disclosure toggle focused, or body focused with a remembered line).
 * @param {Event} event
 * @param {HTMLElement | null} outlineRoot
 * @param {(() => HTMLElement | null | undefined) | undefined} getActiveItem
 */
function itemFromKeyEvent(event, outlineRoot, getActiveItem) {
  const text = textLineFromEvent(event);
  if (text) {
    const fromText = itemFromEventTarget(text);
    if (fromText && (!outlineRoot || outlineRoot.contains(fromText))) return fromText;
  }
  const active = document.activeElement;
  if (active?.closest && outlineRoot?.contains(active)) {
    const fromActive = active.closest('[data-item]');
    if (fromActive && outlineRoot.contains(fromActive)) return fromActive;
  }
  let t = event.target;
  if (t?.nodeType === Node.TEXT_NODE) t = t.parentElement;
  if (t?.closest && outlineRoot?.contains(t)) {
    const fromTarget = t.closest('[data-item]');
    if (fromTarget && outlineRoot.contains(fromTarget)) return fromTarget;
  }
  if (!getActiveItem) return null;
  // Same gate as Move Up/Down: ignore Find / title editing / other fields,
  // but allow menubar buttons and a closed-dialog OK control (common after
  // About) so ⌘← / ⌘→ still reach the remembered line.
  if (isForeignMoveShortcutTarget(event.target)) return null;
  if (isForeignMoveShortcutTarget(active)) return null;
  if (active?.closest?.('dialog[open]')) return null;
  const remembered = getActiveItem();
  if (remembered && (!outlineRoot || outlineRoot.contains(remembered))) {
    return remembered;
  }
  return null;
}

/**
 * @param {KeyboardEvent} event
 * @returns {'up' | 'down' | null}
 */
function arrowDirection(event) {
  const { key, code } = event;
  if (key === 'ArrowUp' || key === 'Up' || code === 'ArrowUp') return 'up';
  if (key === 'ArrowDown' || key === 'Down' || code === 'ArrowDown') return 'down';
  return null;
}

function isCaretAtStart(el) {
  const sel = window.getSelection?.();
  if (!sel || !sel.rangeCount) return false;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return false;
  if (!range.collapsed) return false;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length === 0;
}

/**
 * @param {{
 *   runStructural?: (mutate: () => boolean | void) => boolean | void,
 *   getActiveItem?: () => HTMLElement | null | undefined,
 * }} [options]
 * @param {HTMLElement | null} [outlineRoot]
 */
export function createKeydownHandler(options = {}, outlineRoot = null) {
  const runStructural = options.runStructural ?? ((mutate) => mutate());
  const getActiveItem = options.getActiveItem;

  return function handleKeydown(event) {
    const item = itemFromKeyEvent(event, outlineRoot, getActiveItem);
    if (!item) return;
    const root = item.closest('[data-outline-root]');
    if (!root) return;
    if (outlineRoot && root !== outlineRoot) return;
    const text = textEl(item);
    const textFocused = Boolean(text && document.activeElement === text);

    const arrowDir = arrowDirection(event);

    if (isReadOnly(root)) {
      if (event.key === 'Enter' || event.key === 'Tab' || event.key === 'Backspace') {
        event.preventDefault();
      }
      if (arrowDir) {
        if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
          // Option/Alt+↑/↓: same-level (Shift+arrows stay native selection).
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!focusSameLevelSibling(item, arrowDir)) {
            focusAdjacentItem(item, arrowDir);
          }
        } else if (!event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
          if (focusAdjacentItem(item, arrowDir)) event.preventDefault();
        }
        return;
      }
      return;
    }

    if (
      textFocused &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      event.key.length === 1 &&
      tryInsertSuitShortcut(text, event.key)
    ) {
      event.preventDefault();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      runStructural(() => {
        addItemBelow(item);
        return true;
      });
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      if (event.shiftKey) runStructural(() => promoteItem(item));
      else runStructural(() => demoteItem(item));
      return;
    }

    if (event.key === 'Backspace' && textFocused && text && isCaretAtStart(text)) {
      event.preventDefault();
      runStructural(() => mergeWithPreviousLine(item));
      return;
    }

    if (arrowDir) {
      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
      if (event.altKey) {
        // Option/Alt+↑/↓ for same-level — contenteditable uses Shift+↓ for selection,
        // so Shift is left alone. Prefer same-depth; if none, fall through to adjacent.
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!focusSameLevelSibling(item, arrowDir)) {
          focusAdjacentItem(item, arrowDir);
        }
        return;
      }
      if (focusAdjacentItem(item, arrowDir)) event.preventDefault();
      return;
    }

    if (event.key === 'ArrowLeft' && event.metaKey) {
      event.preventDefault();
      if (event.altKey) {
        collapseItemFully(item);
        return;
      }
      if (hasChildren(item) && isExpanded(item)) toggleItem(item);
      return;
    }

    if (event.key === 'ArrowRight' && event.metaKey) {
      event.preventDefault();
      if (event.altKey) {
        expandItemFully(item);
        return;
      }
      if (hasChildren(item) && !isExpanded(item)) toggleItem(item);
      return;
    }
  };
}

export function handleClick(event) {
  const btn = event.target.closest?.('.toggle');
  if (!btn) return;
  const item = itemFromEventTarget(btn);
  if (!item) return;
  event.preventDefault();
  toggleItem(item);
}
