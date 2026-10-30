/**
 * WYSIWYG HTML outliner based on nested ordered lists.
 *
 * Supports expand/collapse, inline editing, add/remove, promote/demote.
 */

import { fillTextWithSuits, tryInsertSuitShortcut } from './suit-shortcuts.js';
import {
  bindDealDiagrams,
  isDealDiagramItem,
  syncAllDealDiagrams,
} from './deal-diagram.js';
import { clearOutlineFocus } from './outline-focus.js';
import { isForeignMoveShortcutTarget } from './move-up-down-keys.js';

function childList(item) {
  return item.querySelector(':scope > ol');
}

function textEl(item) {
  return item.querySelector(':scope > .row > .text');
}

function toggleBtn(item) {
  return item.querySelector(':scope > .row > .toggle');
}

function directChildItems(item) {
  const list = childList(item);
  if (!list) return [];
  return [...list.children].filter((el) => el.matches('[data-item]'));
}

function ensureChildList(item) {
  let list = childList(item);
  if (!list) {
    list = document.createElement('ol');
    item.appendChild(list);
  }
  return list;
}

function pruneEmptyLists(item) {
  const list = childList(item);
  if (list && list.children.length === 0) {
    list.remove();
  }
}

export function getItemText(item) {
  const el = textEl(item);
  return el ? el.textContent : '';
}

export function getItemTexts(root) {
  return [...root.querySelectorAll('[data-item]')].map(getItemText);
}

export function hasChildren(item) {
  return directChildItems(item).length > 0;
}

export function isExpanded(item) {
  return item.dataset.state !== 'collapsed';
}

/**
 * Nesting depth under the outline root: 0 = top-level (A.), 1 = arabic (1.), 2 = a., …
 * @param {HTMLElement} item
 * @param {HTMLElement | null | undefined} [root]
 * @returns {number}
 */
export function itemOutlineDepth(item, root) {
  let depth = 0;
  let el = item.parentElement?.closest('[data-item]');
  while (el && (!root || root.contains(el))) {
    depth += 1;
    el = el.parentElement?.closest('[data-item]');
  }
  return depth;
}

/**
 * Default open expansion:
 * - one top-level headline → expand it so second-level headlines show
 * - multiple top-level headlines → show only the top level
 * Deeper parents stay collapsed either way.
 * @param {HTMLElement} root
 * @param {{ openDepth?: number }} [options]
 */
export function applyOpenExpansion(root, options = {}) {
  if (!root) return;
  const topCount = root.querySelectorAll(':scope > [data-item]').length;
  const openDepth =
    options.openDepth ?? (topCount === 1 ? 1 : 0);
  root.querySelectorAll('[data-item]').forEach((item) => {
    if (!hasChildren(item)) return;
    const depth = itemOutlineDepth(item, root);
    const list = childList(item);
    if (depth < openDepth) {
      item.dataset.state = 'expanded';
      if (list) list.hidden = false;
    } else {
      item.dataset.state = 'collapsed';
      if (list) list.hidden = true;
    }
    syncItemMeta(item);
  });
}

function syncItemMeta(item) {
  const kids = hasChildren(item);
  item.dataset.hasChildren = kids ? 'true' : 'false';
  if (!kids) {
    item.dataset.state = 'expanded';
    const list = childList(item);
    if (list) list.hidden = false;
  }
  const btn = toggleBtn(item);
  if (btn) {
    btn.disabled = !kids;
    btn.setAttribute('aria-expanded', kids && isExpanded(item) ? 'true' : 'false');
    btn.title = kids
      ? isExpanded(item)
        ? 'Collapse'
        : 'Expand'
      : 'Leaf';
  }
}

function syncTree(root) {
  root.querySelectorAll('[data-item]').forEach(syncItemMeta);
}

export function toggleItem(item) {
  if (!hasChildren(item)) return false;
  const list = childList(item);
  if (!list) return false;
  const next = isExpanded(item) ? 'collapsed' : 'expanded';
  item.dataset.state = next;
  list.hidden = next === 'collapsed';
  syncItemMeta(item);
  return true;
}

/**
 * Expand `item` and every nested parent under it (complete subtree open).
 * @param {HTMLElement | null | undefined} item
 * @returns {boolean} true when any parent was expanded
 */
export function expandItemFully(item) {
  if (!item) return false;
  let changed = false;
  const nodes = [item, ...item.querySelectorAll('[data-item]')];
  for (const node of nodes) {
    if (!hasChildren(node)) continue;
    if (isExpanded(node)) {
      syncItemMeta(node);
      continue;
    }
    node.dataset.state = 'expanded';
    const list = childList(node);
    if (list) list.hidden = false;
    syncItemMeta(node);
    changed = true;
  }
  return changed;
}

export function createItem(text = '') {
  const li = document.createElement('li');
  li.dataset.item = '';
  li.dataset.state = 'expanded';
  li.dataset.hasChildren = 'false';

  const row = document.createElement('div');
  row.className = 'row';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'toggle';
  btn.setAttribute('aria-label', 'Toggle');

  const textNode = document.createElement('div');
  textNode.className = 'text';
  textNode.setAttribute('contenteditable', 'true');
  textNode.contentEditable = 'true';
  textNode.spellcheck = true;
  fillTextWithSuits(textNode, text);

  row.append(btn, textNode);
  li.append(row);
  return li;
}

export function addItemAfter(item, text = '') {
  const created = createItem(text);
  item.after(created);
  syncItemMeta(created);
  const parentItem = item.parentElement?.closest('[data-item]');
  if (parentItem) syncItemMeta(parentItem);
  focusItem(created);
  return created;
}

/**
 * Enter: insert directly below the current line.
 * - Leaf (no subheads): same-level sibling after it.
 * - Parent (has subheads): first child under it (and expand if collapsed).
 */
export function addItemBelow(item, text = '') {
  if (!hasChildren(item)) return addItemAfter(item, text);

  const created = createItem(text);
  const list = ensureChildList(item);
  const first = directChildItems(item)[0];
  if (first) list.insertBefore(created, first);
  else list.appendChild(created);
  item.dataset.state = 'expanded';
  list.hidden = false;
  syncItemMeta(item);
  syncItemMeta(created);
  focusItem(created);
  return created;
}

export function removeItem(item) {
  const root = item.closest('[data-outline-root]');
  const parentItem = item.parentElement?.closest('[data-item]');
  const parentList = item.parentElement;
  const siblings = parentList
    ? [...parentList.children].filter((el) => el.matches('[data-item]'))
    : [];

  // Never remove the last remaining top-level item; clear it instead.
  if (root && item.parentElement === root && siblings.length === 1) {
    const el = textEl(item);
    if (el) el.textContent = '';
    const nested = childList(item);
    if (nested) nested.remove();
    syncItemMeta(item);
    focusItem(item);
    return item;
  }

  // Prefer the line above: previous sibling, else parent (so Backspace after
  // Enter-as-first-child returns to the parent, not the following sibling).
  const prev =
    item.previousElementSibling?.matches?.('[data-item]')
      ? item.previousElementSibling
      : null;
  const next =
    item.nextElementSibling?.matches?.('[data-item]')
      ? item.nextElementSibling
      : null;
  const focusTarget = prev || parentItem || next;

  item.remove();
  if (parentItem) {
    pruneEmptyLists(parentItem);
    syncItemMeta(parentItem);
  }
  if (root) syncTree(root);
  if (focusTarget) focusItem(focusTarget);
  return null;
}

/**
 * Place a collapsed caret at a UTF-16 offset within a contenteditable line.
 * @param {HTMLElement | null | undefined} el
 * @param {number} offset
 */
function setCaretAtTextOffset(el, offset) {
  if (!el) return;
  el.focus();
  const sel = window.getSelection?.();
  if (!sel) return;
  /** @type {Text[]} */
  const texts = [];
  function collect(node) {
    if (node.nodeType === Node.TEXT_NODE) texts.push(/** @type {Text} */ (node));
    else {
      for (const child of node.childNodes) collect(child);
    }
  }
  collect(el);
  let remaining = Math.max(0, offset);
  for (const text of texts) {
    const len = text.length;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(text, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
  }
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Previous visible outline line in document order, or null.
 * @param {HTMLElement} item
 * @param {HTMLElement} root
 */
function previousVisibleItem(item, root) {
  const visible = visibleOutlineItems(root);
  const idx = visible.indexOf(item);
  if (idx <= 0) return null;
  return visible[idx - 1];
}

/**
 * Merge `item` into the previous visible line: append text, reparent children,
 * remove `item`, and leave the caret at the join point.
 * Empty-line Backspace is the special case where appended text is empty.
 * @param {HTMLElement} item
 * @returns {boolean}
 */
export function mergeWithPreviousLine(item) {
  const root = item.closest('[data-outline-root]');
  if (!root) return false;

  const prev = previousVisibleItem(item, root);
  if (!prev) {
    if (getItemText(item) === '') {
      removeItem(item);
      return true;
    }
    return false;
  }

  const prevEl = textEl(prev);
  const curEl = textEl(item);
  const joinAt = prevEl?.textContent?.length ?? 0;
  if (prevEl) {
    // textContent concat would drop .suit-red; re-wrap ♥/♦ like OPML restore.
    fillTextWithSuits(
      prevEl,
      `${prevEl.textContent || ''}${curEl?.textContent || ''}`,
    );
  }

  const kids = directChildItems(item);
  const parentItem = item.parentElement?.closest('[data-item]');
  if (parentItem === prev) {
    for (const kid of kids) {
      item.before(kid);
      syncItemMeta(kid);
    }
  } else if (kids.length) {
    const list = ensureChildList(prev);
    for (const kid of kids) {
      list.appendChild(kid);
      syncItemMeta(kid);
    }
    prev.dataset.state = 'expanded';
    list.hidden = false;
  }

  item.remove();
  if (parentItem) {
    pruneEmptyLists(parentItem);
    syncItemMeta(parentItem);
  }
  syncItemMeta(prev);
  syncTree(root);
  setCaretAtTextOffset(prevEl, joinAt);
  return true;
}

/**
 * Run a DOM mutation without stealing focus or moving the caret on `item`'s text.
 * Moving nodes can blur in some engines; restore the prior caret instead of jumping to the end.
 * @template T
 * @param {HTMLElement} item
 * @param {() => T} mutate
 * @returns {T}
 */
function withoutFocusChange(item, mutate) {
  const el = textEl(item);
  const hadFocus = Boolean(el && document.activeElement === el);
  let startContainer = null;
  let startOffset = null;
  if (hadFocus) {
    const sel = window.getSelection?.();
    if (sel?.rangeCount) {
      const range = sel.getRangeAt(0);
      if (el === range.startContainer || el.contains(range.startContainer)) {
        startContainer = range.startContainer;
        startOffset = range.startOffset;
      }
    }
  }

  const result = mutate();

  if (hadFocus && el?.isConnected) {
    el.focus();
    if (startOffset != null && window.getSelection) {
      try {
        const node =
          startContainer?.isConnected ? startContainer : el.firstChild || el;
        const max =
          node.nodeType === Node.TEXT_NODE
            ? node.textContent.length
            : node.childNodes.length;
        const range = document.createRange();
        range.setStart(node, Math.min(startOffset, max));
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch {
        /* ignore selection restore failures */
      }
    }
  }

  return result;
}

export function demoteItem(item) {
  const prev = item.previousElementSibling;
  if (!prev || !prev.matches('[data-item]')) return false;

  return withoutFocusChange(item, () => {
    const list = ensureChildList(prev);
    list.appendChild(item);
    prev.dataset.state = 'expanded';
    list.hidden = false;
    syncItemMeta(prev);
    syncItemMeta(item);
    return true;
  });
}

export function promoteItem(item) {
  const parentItem = item.parentElement?.closest('[data-item]');
  if (!parentItem) return false;

  return withoutFocusChange(item, () => {
    const following = [];
    let sib = item.nextElementSibling;
    while (sib) {
      const next = sib.nextElementSibling;
      if (sib.matches('[data-item]')) following.push(sib);
      sib = next;
    }

    parentItem.after(item);

    if (following.length) {
      const list = ensureChildList(item);
      following.forEach((f) => list.appendChild(f));
      item.dataset.state = 'expanded';
      list.hidden = false;
    }

    pruneEmptyLists(parentItem);
    syncItemMeta(parentItem);
    syncItemMeta(item);
    following.forEach(syncItemMeta);
    return true;
  });
}

/**
 * Toolbar Promote: lift this item's children up so they become its siblings
 * (inserted immediately after it). Tab/Shift+Tab still use promoteItem/demoteItem.
 */
export function promoteChildren(item) {
  const children = directChildItems(item);
  if (!children.length) return false;

  return withoutFocusChange(item, () => {
    let insertAfter = item;
    for (const child of children) {
      insertAfter.after(child);
      insertAfter = child;
      syncItemMeta(child);
    }
    pruneEmptyLists(item);
    syncItemMeta(item);
    const root = item.closest('[data-outline-root]');
    if (root) syncTree(root);
    return true;
  });
}

/**
 * Move among same-level siblings (children stay nested under the item).
 * @param {HTMLElement} item
 * @returns {boolean}
 */
export function moveItemUp(item) {
  const prev = item.previousElementSibling;
  if (!prev || !prev.matches('[data-item]')) return false;
  return withoutFocusChange(item, () => {
    prev.before(item);
    return true;
  });
}

/**
 * @param {HTMLElement} item
 * @returns {boolean}
 */
export function moveItemDown(item) {
  const next = item.nextElementSibling;
  if (!next || !next.matches('[data-item]')) return false;
  return withoutFocusChange(item, () => {
    next.after(item);
    return true;
  });
}

/**
 * Toolbar Demote: pull following same-level siblings under this item as children.
 * Tab/Shift+Tab still use promoteItem/demoteItem.
 */
export function demoteFollowingSiblings(item) {
  const following = [];
  let sib = item.nextElementSibling;
  while (sib) {
    const next = sib.nextElementSibling;
    if (sib.matches('[data-item]')) following.push(sib);
    sib = next;
  }
  if (!following.length) return false;

  return withoutFocusChange(item, () => {
    const list = ensureChildList(item);
    following.forEach((f) => list.appendChild(f));
    item.dataset.state = 'expanded';
    list.hidden = false;
    syncItemMeta(item);
    following.forEach(syncItemMeta);
    const root = item.closest('[data-outline-root]');
    if (root) syncTree(root);
    return true;
  });
}

export function serializeOutline(root) {
  function walk(list) {
    return [...list.children]
      .filter((el) => el.matches('[data-item]') && !isDealDiagramItem(el))
      .map((item) => {
        const nested = childList(item);
        return {
          text: getItemText(item),
          children: nested ? walk(nested) : [],
        };
      });
  }
  return walk(root);
}

export function focusItem(item) {
  const el = textEl(item);
  if (!el) return;
  el.focus();
  const selection = window.getSelection?.();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

/**
 * Nesting depth relative to the outline root (0 = top-level).
 * @param {HTMLElement} item
 * @param {HTMLElement} root
 */
function outlineDepth(item, root) {
  let depth = 0;
  let el = item.parentElement;
  while (el && el !== root) {
    if (el.matches?.('[data-item]')) depth += 1;
    el = el.parentElement;
  }
  return depth;
}

/**
 * True when the item is shown (not under a collapsed parent's hidden list).
 * @param {HTMLElement} item
 * @param {HTMLElement} root
 */
function isVisibleOutlineItem(item, root) {
  if (item.dataset?.focusRole === 'hidden' || item.dataset?.focusRole === 'ancestor') {
    return false;
  }
  let el = item.parentElement;
  while (el && el !== root) {
    if (el.matches?.('ol') && el.hidden) return false;
    el = el.parentElement;
  }
  return true;
}

/**
 * Visible outline items in document order.
 * @param {HTMLElement} root
 */
function visibleOutlineItems(root) {
  return [...root.querySelectorAll('[data-item]')].filter((el) =>
    isVisibleOutlineItem(el, root),
  );
}

/**
 * Move focus to the previous or next visible headline at the same nesting depth
 * (not only DOM siblings — so Option+↓ works past the last child of a parent).
 * @param {HTMLElement} item
 * @param {'up' | 'down'} direction
 * @returns {boolean} true if focus moved
 */
export function focusSameLevelSibling(item, direction) {
  const root = item.closest('[data-outline-root]');
  if (!root) return false;
  const visible = visibleOutlineItems(root);
  const idx = visible.indexOf(item);
  if (idx < 0) return false;
  const depth = outlineDepth(item, root);
  if (direction === 'down') {
    for (let i = idx + 1; i < visible.length; i += 1) {
      if (outlineDepth(visible[i], root) === depth) {
        focusItem(visible[i]);
        return true;
      }
    }
  } else {
    for (let i = idx - 1; i >= 0; i -= 1) {
      if (outlineDepth(visible[i], root) === depth) {
        focusItem(visible[i]);
        return true;
      }
    }
  }
  return false;
}

/**
 * Move focus to the previous or next visible line in document order (any nesting level).
 * @param {HTMLElement} item
 * @param {'up' | 'down'} direction
 * @returns {boolean} true if focus moved
 */
export function focusAdjacentItem(item, direction) {
  const root = item.closest('[data-outline-root]');
  if (!root) return false;
  const visible = visibleOutlineItems(root);
  const idx = visible.indexOf(item);
  if (idx < 0) return false;
  const next = direction === 'up' ? visible[idx - 1] : visible[idx + 1];
  if (!next) return false;
  focusItem(next);
  return true;
}

function itemFromEventTarget(target) {
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
function createKeydownHandler(options = {}, outlineRoot = null) {
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

    if (event.key === 'ArrowLeft' && event.metaKey && !event.altKey) {
      event.preventDefault();
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

function handleClick(event) {
  const btn = event.target.closest?.('.toggle');
  if (!btn) return;
  const item = itemFromEventTarget(btn);
  if (!item) return;
  event.preventDefault();
  toggleItem(item);
}

export function mountOutliner(root, options = {}) {
  if (!root) throw new Error('outline root required');
  let lastFocusedItem = root.querySelector('[data-item]');

  root.querySelectorAll('[data-item]').forEach((item) => {
    if (!item.dataset.state) item.dataset.state = 'expanded';
    const list = childList(item);
    if (list) list.hidden = item.dataset.state === 'collapsed';
  });
  syncTree(root);

  function rememberItem(event) {
    const item = itemFromEventTarget(event.target);
    if (item && root.contains(item)) lastFocusedItem = item;
  }

  function getActiveItem() {
    const el = document.activeElement;
    const fromFocus = el?.closest?.('[data-item]');
    if (fromFocus && root.contains(fromFocus)) return fromFocus;
    if (lastFocusedItem && root.contains(lastFocusedItem)) return lastFocusedItem;
    return root.querySelector('[data-item]');
  }

  if (options.bindEvents !== false) {
    // Document capture: handle Option+arrows before the editing host.
    const onKeyDown = createKeydownHandler(
      { ...options, getActiveItem },
      root,
    );
    document.addEventListener('keydown', onKeyDown, true);
    root.addEventListener('click', (event) => {
      rememberItem(event);
      handleClick(event);
    });
    root.addEventListener('focusin', rememberItem);
    root.addEventListener('mouseup', rememberItem);
    bindDealDiagrams(root);
  }

  return {
    root,
    addItemAfter,
    addItemBelow,
    removeItem,
    promoteItem,
    demoteItem,
    promoteChildren,
    demoteFollowingSiblings,
    moveItemUp,
    moveItemDown,
    toggleItem,
    expandItemFully,
    focusSameLevelSibling,
    focusAdjacentItem,
    getActiveItem,
    serialize: () => serializeOutline(root),
  };
}

// Browser entry: auto-mount when loaded as a classic or module script with a root present.
export function boot(selector = '[data-outline-root]', options = {}) {
  const root = document.querySelector(selector);
  if (!root) return null;
  return mountOutliner(root, options);
}


function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function directItems(list) {
  return [...list.children].filter(
    (el) => el.matches('[data-item]') && !isDealDiagramItem(el),
  );
}

function collectOutlineNodes(root) {
  const nodes = [];
  function walk(list) {
    for (const item of directItems(list)) {
      nodes.push(item);
      const nested = childList(item);
      if (nested) walk(nested);
    }
  }
  walk(root);
  return nodes;
}

function buildExpansionState(root) {
  const nodes = collectOutlineNodes(root);
  const expandedIndexes = [];
  nodes.forEach((item, index) => {
    if (hasChildren(item) && isExpanded(item)) {
      expandedIndexes.push(index + 1);
    }
  });
  return expandedIndexes.join(',');
}

function outlineElementsXml(list, indent) {
  const pad = '  '.repeat(indent);
  let xml = '';
  for (const item of directItems(list)) {
    const text = escapeXml(getItemText(item));
    const nested = childList(item);
    const kids = nested ? directItems(nested) : [];
    if (kids.length === 0) {
      xml += `${pad}<outline text="${text}"/>\n`;
    } else {
      xml += `${pad}<outline text="${text}">\n`;
      xml += outlineElementsXml(nested, indent + 1);
      xml += `${pad}</outline>\n`;
    }
  }
  return xml;
}

/**
 * @param {Date | string | number | null | undefined} date
 * @returns {string}
 */
function opmlDateModified(date) {
  if (date == null || date === '') return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(+d)) return '';
  return d.toUTCString();
}

/** Serialize the live outline DOM to an OPML 2.0 document string. */
export function toOpml(root, options = {}) {
  const title = escapeXml(options.title ?? 'Outline');
  const expansionState =
    options.includeExpansionState === false
      ? ''
      : buildExpansionState(root);
  const modified = opmlDateModified(options.dateModified);
  const dateModifiedLine = modified
    ? `    <dateModified>${escapeXml(modified)}</dateModified>\n`
    : '';
  const body = outlineElementsXml(root, 2);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<opml version="2.0">\n` +
    `  <head>\n` +
    `    <title>${title}</title>\n` +
    dateModifiedLine +
    `    <expansionState>${expansionState}</expansionState>\n` +
    `  </head>\n` +
    `  <body>\n` +
    body +
    `  </body>\n` +
    `</opml>\n`
  );
}

function outlineText(el) {
  return el.getAttribute('text') ?? el.getAttribute('title') ?? '';
}

function parseOutlineElement(el, expandedSet, indexRef, hasExpansionState) {
  const index = indexRef.value;
  indexRef.value += 1;
  const children = [...el.children].filter(
    (child) => child.localName?.toLowerCase() === 'outline',
  );
  const node = {
    text: outlineText(el),
    children: [],
    expanded: true,
  };
  if (children.length) {
    if (hasExpansionState) {
      node.expanded = expandedSet.has(index);
    } else {
      node.expanded = true;
    }
    node.children = children.map((child) =>
      parseOutlineElement(child, expandedSet, indexRef, hasExpansionState),
    );
  }
  return node;
}

/** Parse an OPML document string into { title, items }. */
export function parseOpml(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid OPML: ' + parseError.textContent.trim());
  }
  const opml = doc.querySelector('opml') ?? doc.documentElement;
  if (!opml || opml.localName?.toLowerCase() !== 'opml') {
    throw new Error('Invalid OPML: missing opml root');
  }
  const title = opml.querySelector('head > title')?.textContent ?? 'Outline';
  const dateModifiedRaw =
    opml.querySelector('head > dateModified')?.textContent?.trim() || '';
  const dateModifiedParsed = dateModifiedRaw ? new Date(dateModifiedRaw) : null;
  const dateModified =
    dateModifiedParsed && !Number.isNaN(+dateModifiedParsed)
      ? dateModifiedParsed
      : null;
  const expansionRaw = opml.querySelector('head > expansionState')?.textContent ?? '';
  // Presence of expansionState means we honor it (empty => all parents collapsed).
  const expansionPresent = Boolean(opml.querySelector('head > expansionState'));
  const expandedSet = new Set(
    expansionRaw
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
  );
  const body = opml.querySelector('body');
  const top = body
    ? [...body.children].filter((el) => el.localName?.toLowerCase() === 'outline')
    : [];
  const indexRef = { value: 1 };
  const items = top.map((el) =>
    parseOutlineElement(el, expandedSet, indexRef, expansionPresent),
  );
  return { title, items, dateModified };
}

function renderItem(node) {
  const li = createItem(node.text ?? '');
  li.dataset.state = node.expanded === false ? 'collapsed' : 'expanded';
  const kids = node.children ?? [];
  if (kids.length) {
    const list = document.createElement('ol');
    kids.forEach((child) => list.appendChild(renderItem(child)));
    list.hidden = li.dataset.state === 'collapsed';
    li.appendChild(list);
  }
  return li;
}

/** Replace the contents of an outline root with a parsed tree. */
export function loadOutline(root, tree) {
  clearOutlineFocus(root);
  const items = tree?.items ?? [];
  root.replaceChildren();
  if (items.length === 0) {
    root.appendChild(createItem(''));
  } else {
    items.forEach((node) => root.appendChild(renderItem(node)));
  }
  syncTree(root);
  syncAllDealDiagrams(root);
  if (isReadOnly(root)) setReadOnly(root, true);
  return root;
}

/**
 * Insert a parsed OPML tree into `root` as siblings immediately after `afterItem`
 * (same nesting level). When `afterItem` is omitted or not in the outline, append
 * at the top level. Does not change the document title.
 * @param {HTMLElement} root
 * @param {{ items?: Array<{ text?: string, children?: unknown[], expanded?: boolean }> }} tree
 * @param {HTMLElement | null} [afterItem]
 * @returns {HTMLElement | null} first inserted item, or null if nothing to insert
 */
export function insertOutline(root, tree, afterItem = null) {
  const items = tree?.items ?? [];
  if (!items.length) return null;

  const nodes = items.map((node) => renderItem(node));
  const anchor =
    afterItem && root.contains(afterItem) && afterItem.matches?.('[data-item]')
      ? afterItem
      : null;

  if (anchor) {
    let prev = anchor;
    for (const li of nodes) {
      prev.after(li);
      prev = li;
    }
  } else {
    nodes.forEach((li) => root.appendChild(li));
  }

  syncTree(root);
  syncAllDealDiagrams(root);
  if (isReadOnly(root)) setReadOnly(root, true);
  focusItem(nodes[0]);
  return nodes[0];
}

/**
 * Replace the outline with a single empty line.
 * @returns {string} OPML snapshot of the previous content (for undo).
 */
export function clearOutline(root, options = {}) {
  const snapshot = toOpml(root, options);
  loadOutline(root, { items: [] });
  const first = root.querySelector('[data-item]');
  if (first) focusItem(first);
  return snapshot;
}

/** Whether the outline is in read-only (share view) mode. */
export function isReadOnly(root) {
  return root?.dataset?.readonly === 'true';
}

/**
 * Toggle read-only viewing: disable contenteditable on all item text.
 * @param {HTMLElement} root
 * @param {boolean} readOnly
 */
export function setReadOnly(root, readOnly) {
  if (!root) return root;
  if (readOnly) root.dataset.readonly = 'true';
  else delete root.dataset.readonly;
  root.querySelectorAll('.text').forEach((el) => {
    const value = readOnly ? 'false' : 'true';
    el.setAttribute('contenteditable', value);
    el.contentEditable = value;
  });
  return root;
}

export function downloadOpml(root, options = {}) {
  const xml = toOpml(root, options);
  const filename = options.filename ?? 'outline.opml';
  const blob = new Blob([xml], { type: 'text/x-opml' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return xml;
}

export async function readOpmlFile(file) {
  const text = await file.text();
  return parseOpml(text);
}
