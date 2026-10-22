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
  const outlineRoot = item.closest('[data-outline-root]');
  if (isReadOnly(outlineRoot)) {
    if (event.key === 'Enter' || event.key === 'Tab' || event.key === 'Backspace') {
      event.preventDefault();
    }
    return;
  }

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


function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function directItems(list) {
  return [...list.children].filter((el) => el.matches('[data-item]'));
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

/** Serialize the live outline DOM to an OPML 2.0 document string. */
export function toOpml(root, options = {}) {
  const title = escapeXml(options.title ?? 'Outline');
  const expansionState = buildExpansionState(root);
  const body = outlineElementsXml(root, 2);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<opml version="2.0">\n` +
    `  <head>\n` +
    `    <title>${title}</title>\n` +
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
  return { title, items };
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
  const items = tree?.items ?? [];
  root.replaceChildren();
  if (items.length === 0) {
    root.appendChild(createItem(''));
  } else {
    items.forEach((node) => root.appendChild(renderItem(node)));
  }
  syncTree(root);
  if (isReadOnly(root)) setReadOnly(root, true);
  return root;
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
    el.contentEditable = readOnly ? 'false' : 'true';
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
