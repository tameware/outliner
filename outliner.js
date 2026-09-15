/**
 * WYSIWYG HTML outliner based on nested ordered lists.
 *
 * Supports expand/collapse, inline editing, add/remove, promote/demote.
 */

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
  textNode.contentEditable = 'true';
  textNode.spellcheck = true;
  textNode.textContent = text;

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

  const focusTarget =
    item.previousElementSibling?.matches?.('[data-item]')
      ? item.previousElementSibling
      : item.nextElementSibling?.matches?.('[data-item]')
        ? item.nextElementSibling
        : parentItem;

  item.remove();
  if (parentItem) {
    pruneEmptyLists(parentItem);
    syncItemMeta(parentItem);
  }
  if (root) syncTree(root);
  if (focusTarget) focusItem(focusTarget);
  return null;
}

export function demoteItem(item) {
  const prev = item.previousElementSibling;
  if (!prev || !prev.matches('[data-item]')) return false;

  const list = ensureChildList(prev);
  list.appendChild(item);
  prev.dataset.state = 'expanded';
  list.hidden = false;
  syncItemMeta(prev);
  syncItemMeta(item);
  focusItem(item);
  return true;
}

export function promoteItem(item) {
  const parentItem = item.parentElement?.closest('[data-item]');
  if (!parentItem) return false;

  const parentList = item.parentElement;
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
  focusItem(item);
  return true;
}

export function serializeOutline(root) {
  function walk(list) {
    return [...list.children]
      .filter((el) => el.matches('[data-item]'))
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

function itemFromEventTarget(target) {
  return target?.closest?.('[data-item]') ?? null;
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

function handleKeydown(event) {
  const item = itemFromEventTarget(event.target);
  if (!item || !event.target.classList?.contains('text')) return;

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    addItemAfter(item);
    return;
  }

  if (event.key === 'Tab') {
    event.preventDefault();
    if (event.shiftKey) promoteItem(item);
    else demoteItem(item);
    return;
  }

  if (event.key === 'Backspace' && getItemText(item) === '' && isCaretAtStart(event.target)) {
    event.preventDefault();
    removeItem(item);
    return;
  }

  if (event.key === 'ArrowLeft' && event.metaKey) {
    event.preventDefault();
    if (hasChildren(item) && isExpanded(item)) toggleItem(item);
    return;
  }

  if (event.key === 'ArrowRight' && event.metaKey) {
    event.preventDefault();
    if (hasChildren(item) && !isExpanded(item)) toggleItem(item);
    return;
  }
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

  if (options.bindEvents !== false) {
    root.addEventListener('keydown', handleKeydown);
    root.addEventListener('click', (event) => {
      rememberItem(event);
      handleClick(event);
    });
    root.addEventListener('focusin', rememberItem);
    root.addEventListener('mouseup', rememberItem);
  }

  return {
    root,
    addItemAfter,
    removeItem,
    promoteItem,
    demoteItem,
    toggleItem,
    getActiveItem: () => {
      const el = document.activeElement;
      const fromFocus = el?.closest?.('[data-item]');
      if (fromFocus && root.contains(fromFocus)) return fromFocus;
      if (lastFocusedItem && root.contains(lastFocusedItem)) return lastFocusedItem;
      return root.querySelector('[data-item]');
    },
    serialize: () => serializeOutline(root),
  };
}

// Browser entry: auto-mount when loaded as a classic or module script with a root present.
export function boot(selector = '[data-outline-root]') {
  const root = document.querySelector(selector);
  if (!root) return null;
  return mountOutliner(root);
}
