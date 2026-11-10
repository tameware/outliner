/**
 * OPML serialize / parse / load / insert / download.
 */

import { clearOutlineFocus } from './outline-focus.js';
import { isDealDiagramItem } from './deal-diagram.js';
import {
  childList,
  createItem,
  getItemText,
  hasChildren,
  isExpanded,
  syncTree,
  focusItem,
  isReadOnly,
  setReadOnly,
} from './model.js';

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
