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
 * @param {HTMLElement} textEl
 * @param {number} offset
 */
function placeCaretAt(textEl, offset) {
  textEl.focus();
  const node = textEl.firstChild;
  const sel = window.getSelection?.();
  if (!sel) return;
  const range = document.createRange();
  if (node && node.nodeType === 3) {
    range.setStart(node, Math.min(offset, node.textContent.length));
  } else {
    range.selectNodeContents(textEl);
    range.collapse(offset === 0);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Replace a preceding "!" plus the typed suit letter with the Unicode glyph.
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

  const afterRange = range.cloneRange();
  afterRange.selectNodeContents(textEl);
  afterRange.setStart(range.startContainer, range.startOffset);
  const after = afterRange.toString();

  textEl.textContent = before.slice(0, -1) + glyph + after;
  placeCaretAt(textEl, before.length - 1 + glyph.length);
  return true;
}
