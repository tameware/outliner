/**
 * Outline DOM model: structure, expand/collapse, focus, and read-only.
 */

import { fillTextWithSuits } from './suit-shortcuts.js';
import { isDealDiagramItem } from './deal-diagram.js';

export function childList(item) {
  return item.querySelector(':scope > ol');
}

export function textEl(item) {
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

export function syncTree(root) {
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

/**
 * Collapse `item` and every nested parent under it so a later one-level
 * expand only reveals the next depth.
 * @param {HTMLElement | null | undefined} item
 * @returns {boolean} true when any parent was collapsed
 */
export function collapseItemFully(item) {
  if (!item) return false;
  let changed = false;
  const nodes = [item, ...item.querySelectorAll('[data-item]')];
  for (const node of nodes) {
    if (!hasChildren(node)) continue;
    if (!isExpanded(node)) {
      syncItemMeta(node);
      continue;
    }
    node.dataset.state = 'collapsed';
    const list = childList(node);
    if (list) list.hidden = true;
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
