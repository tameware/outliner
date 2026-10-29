/** Card-suit bang shortcuts: !c !d !h !s */

export const SUIT_GLYPHS = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

const BY_LETTER = {
  c: SUIT_GLYPHS.clubs,
  d: SUIT_GLYPHS.diamonds,
  h: SUIT_GLYPHS.hearts,
  s: SUIT_GLYPHS.spades,
};

/**
 * @param {string} key
 * @returns {string | null}
 */
export function suitGlyphForKey(key) {
  if (!key || key.length !== 1) return null;
  return BY_LETTER[key.toLowerCase()] ?? null;
}

/** @param {string} glyph */
export function isRedSuit(glyph) {
  return glyph === SUIT_GLYPHS.hearts || glyph === SUIT_GLYPHS.diamonds;
}

/**
 * @param {string} glyph
 * @returns {Text | HTMLElement}
 */
export function createSuitNode(glyph) {
  if (isRedSuit(glyph)) {
    const span = document.createElement('span');
    span.className = 'suit suit-red';
    span.textContent = glyph;
    return span;
  }
  return document.createTextNode(glyph);
}

/**
 * Replace an element's children with plain text, wrapping ♥/♦ in `.suit-red`.
 * Used when restoring lines from OPML (undo/load) so red suits stay red.
 * @param {HTMLElement} el
 * @param {string} text
 */
export function fillTextWithSuits(el, text) {
  el.replaceChildren();
  const value = String(text ?? '');
  if (!value) return;

  let buf = '';
  const flush = () => {
    if (!buf) return;
    el.appendChild(document.createTextNode(buf));
    buf = '';
  };
  for (const ch of value) {
    if (isRedSuit(ch)) {
      flush();
      el.appendChild(createSuitNode(ch));
    } else {
      buf += ch;
    }
  }
  flush();
}

/**
 * @param {string} textBeforeCaret
 * @param {string} key
 * @returns {string | null} glyph to insert, or null if no match
 */
export function matchSuitShortcut(textBeforeCaret, key) {
  const glyph = suitGlyphForKey(key);
  if (!glyph) return null;
  if (!String(textBeforeCaret || '').endsWith('!')) return null;
  return glyph;
}

/**
 * Text immediately before the caret inside a contenteditable.
 * @param {HTMLElement} textEl
 * @returns {string}
 */
export function textBeforeCaret(textEl) {
  const sel = window.getSelection?.();
  if (!sel?.rangeCount || !textEl) return '';
  const range = sel.getRangeAt(0);
  if (!textEl.contains(range.startContainer) && range.startContainer !== textEl) {
    return '';
  }
  const pre = range.cloneRange();
  pre.selectNodeContents(textEl);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString();
}

/**
 * @param {Node} node
 */
function placeCaretAfter(node) {
  const sel = window.getSelection?.();
  if (!sel) return;
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  const root = node.parentElement;
  root?.focus?.();
}

/**
 * Delete the single character immediately before a collapsed caret.
 * @param {Range} range
 * @returns {boolean}
 */
function deleteCharBeforeCaret(range) {
  const { startContainer, startOffset } = range;
  if (startContainer.nodeType === Node.TEXT_NODE && startOffset > 0) {
    /** @type {Text} */ (startContainer).deleteData(startOffset - 1, 1);
    range.setStart(startContainer, startOffset - 1);
    range.collapse(true);
    return true;
  }
  // Caret at the start of a node — previous sibling may end with "!".
  let node = startContainer;
  if (node.nodeType === Node.TEXT_NODE && startOffset === 0) {
    node = node.previousSibling;
  } else if (node.nodeType === Node.ELEMENT_NODE && startOffset > 0) {
    node = node.childNodes[startOffset - 1];
  } else {
    node = node.previousSibling;
  }
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    node = node.lastChild;
  }
  if (node?.nodeType === Node.TEXT_NODE && node.length > 0) {
    /** @type {Text} */ (node).deleteData(node.length - 1, 1);
    range.setStart(node, node.length);
    range.collapse(true);
    return true;
  }
  return false;
}

/**
 * Replace a preceding "!" plus the typed suit letter with the Unicode glyph.
 * Hearts and diamonds are wrapped in `.suit-red` for red display.
 * Existing red-suit spans on the line are left intact.
 * @param {HTMLElement} textEl
 * @param {string} key
 * @returns {boolean}
 */
export function tryInsertSuitShortcut(textEl, key) {
  const before = textBeforeCaret(textEl);
  const glyph = matchSuitShortcut(before, key);
  if (!glyph) return false;

  const sel = window.getSelection?.();
  if (!sel?.rangeCount) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;
  if (!textEl.contains(range.startContainer) && range.startContainer !== textEl) {
    return false;
  }

  if (!deleteCharBeforeCaret(range)) return false;

  const suitNode = createSuitNode(glyph);
  range.insertNode(suitNode);
  placeCaretAfter(suitNode);
  return true;
}
