/**
 * Find / Replace across outline line text (literal or Grep/regex).
 */

import { isDealDiagramItem } from './deal-diagram.js';
import { expandSuitBangShortcuts, fillTextWithSuits } from './suit-shortcuts.js';
import { isExpanded, toggleItem } from './outliner.js';

/**
 * @param {HTMLElement} item
 * @returns {HTMLElement | null}
 */
function textEl(item) {
  return item.querySelector(':scope > .row > .text');
}

/**
 * Searchable outline lines in document order (skips deal diagrams).
 * @param {HTMLElement} root
 * @returns {HTMLElement[]}
 */
export function collectSearchableItems(root) {
  if (!root) return [];
  return [...root.querySelectorAll('[data-item]')].filter(
    (el) => !isDealDiagramItem(el) && textEl(el),
  );
}

/**
 * @param {string} find
 * @param {{ grep?: boolean, caseSensitive?: boolean, wholeWord?: boolean }} options
 * @returns {{ regex: RegExp | null, error?: string }}
 */
export function buildFindRegex(find, options = {}) {
  const pattern = String(find ?? '');
  if (!pattern) return { regex: null };
  const flags = options.caseSensitive ? 'g' : 'gi';
  /** @type {string} */
  let source;
  if (options.grep) {
    source = pattern;
  } else {
    source = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  if (options.wholeWord) {
    source = `\\b(?:${source})\\b`;
  }
  try {
    return { regex: new RegExp(source, flags) };
  } catch (error) {
    return { regex: null, error: error?.message || String(error) };
  }
}

/**
 * @typedef {{ item: HTMLElement, start: number, end: number, matchText: string }} FindMatch
 */

/**
 * @param {HTMLElement} root
 * @param {{ find: string, grep?: boolean, caseSensitive?: boolean, wholeWord?: boolean }} options
 * @returns {FindMatch[] & { error?: string }}
 */
export function findMatches(root, options) {
  /** @type {FindMatch[] & { error?: string }} */
  const matches = [];
  const { regex, error } = buildFindRegex(options.find, options);
  if (error) {
    matches.error = error;
    return matches;
  }
  if (!regex) return matches;

  for (const item of collectSearchableItems(root)) {
    const text = textEl(item)?.textContent ?? '';
    regex.lastIndex = 0;
    let m = regex.exec(text);
    while (m) {
      const matchText = m[0];
      if (matchText.length === 0) {
        // Avoid infinite loops on zero-width matches.
        if (regex.lastIndex === m.index) regex.lastIndex += 1;
        m = regex.exec(text);
        continue;
      }
      matches.push({
        item,
        start: m.index,
        end: m.index + matchText.length,
        matchText,
      });
      m = regex.exec(text);
    }
  }
  return matches;
}

/**
 * @param {FindMatch[]} matches
 * @param {number} currentIndex
 * @param {{ direction: 1 | -1, wrapAround?: boolean }} options
 * @returns {number}
 */
export function findNextIndex(matches, currentIndex, options) {
  const n = matches.length;
  if (!n) return -1;
  const dir = options.direction === -1 ? -1 : 1;
  const wrap = options.wrapAround !== false;
  let next = currentIndex + dir;
  if (next >= n) return wrap ? 0 : -1;
  if (next < 0) return wrap ? n - 1 : -1;
  return next;
}

/**
 * Expand `$1` / `$$` when Grep is on, then expand `!c` `!d` `!h` `!s` suit bangs.
 * @param {string} template
 * @param {RegExpMatchArray | { 0: string, index?: number, [k: number]: string }} match
 * @param {{ grep?: boolean }} options
 */
export function expandReplaceTemplate(template, match, options = {}) {
  let value = String(template ?? '');
  if (options.grep) {
    value = value.replace(/\$(\$|\d+)/g, (_, token) => {
      if (token === '$') return '$';
      const idx = Number(token);
      return match[idx] != null ? String(match[idx]) : `$${token}`;
    });
  }
  return expandSuitBangShortcuts(value);
}

/**
 * Replace the first match of `regex` in `text` (regex must not rely on sticky lastIndex).
 * @param {string} text
 * @param {RegExp} regex
 * @param {string} replace
 * @param {{ grep?: boolean }} options
 */
export function applyReplaceInText(text, regex, replace, options = {}) {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const re = new RegExp(regex.source, flags);
  re.lastIndex = 0;
  const m = re.exec(text);
  if (!m) return text;
  const insertion = expandReplaceTemplate(replace, m, options);
  return text.slice(0, m.index) + insertion + text.slice(m.index + m[0].length);
}

/**
 * Expand every collapsed ancestor of `item` so Find can show the match.
 * @param {HTMLElement | null | undefined} item
 * @param {HTMLElement | null | undefined} root
 * @returns {boolean} true when any ancestor was expanded
 */
export function expandCollapsedAncestors(item, root) {
  if (!item || !root) return false;
  /** @type {HTMLElement[]} */
  const ancestors = [];
  let el = item.parentElement;
  while (el && el !== root) {
    if (el.matches?.('[data-item]')) ancestors.push(/** @type {HTMLElement} */ (el));
    el = el.parentElement;
  }
  let changed = false;
  for (const ancestor of ancestors.reverse()) {
    if (!isExpanded(ancestor) && toggleItem(ancestor)) changed = true;
  }
  return changed;
}

/**
 * @param {HTMLElement | null | undefined} el
 * @param {number} start
 * @param {number} end
 */
export function selectTextRange(el, start, end) {
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

  /**
   * @param {number} offset
   * @returns {{ node: Text, offset: number } | null}
   */
  function pointAt(offset) {
    let remaining = Math.max(0, offset);
    for (const text of texts) {
      const len = text.length;
      if (remaining <= len) return { node: text, offset: remaining };
      remaining -= len;
    }
    if (!texts.length) return null;
    const last = texts[texts.length - 1];
    return { node: last, offset: last.length };
  }

  const a = pointAt(start);
  const b = pointAt(end);
  if (!a || !b) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(start <= end);
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * @param {HTMLElement} item
 * @param {string} nextText
 */
function setItemText(item, nextText) {
  const el = textEl(item);
  if (!el) return;
  fillTextWithSuits(el, nextText);
}

/**
 * Replace a single recorded match in its line.
 * @param {FindMatch} match
 * @param {string} replace
 * @param {{ grep?: boolean, find?: string, caseSensitive?: boolean }} [options]
 * @returns {boolean}
 */
export function replaceMatch(match, replace, options = {}) {
  if (!match?.item) return false;
  const el = textEl(match.item);
  if (!el) return false;
  const text = el.textContent ?? '';
  const slice = text.slice(match.start, match.end);
  if (slice !== match.matchText && options.find) {
    // Stale match — rebuild from current text using find options if provided.
  }
  let insertion = expandReplaceTemplate(replace, { 0: match.matchText }, options);
  if (options.grep && options.find != null) {
    const { regex } = buildFindRegex(options.find, options);
    if (regex) {
      regex.lastIndex = 0;
      const sub = text.slice(match.start, match.end);
      const m = regex.exec(sub);
      if (m) {
        m.index = match.start;
        insertion = expandReplaceTemplate(replace, m, { grep: true });
      }
    }
  }
  const next = text.slice(0, match.start) + insertion + text.slice(match.end);
  setItemText(match.item, next);
  return true;
}

/**
 * @param {HTMLElement} root
 * @param {{ find: string, replace?: string, grep?: boolean, caseSensitive?: boolean, wholeWord?: boolean }} options
 * @returns {number} number of replacements
 */
export function replaceAllMatches(root, options) {
  const find = options.find;
  if (!find) return 0;
  const { regex, error } = buildFindRegex(find, options);
  if (!regex || error) return 0;
  const replace = options.replace ?? '';
  let count = 0;

  for (const item of collectSearchableItems(root)) {
    const el = textEl(item);
    if (!el) continue;
    let text = el.textContent ?? '';
    const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
    let next = '';
    let last = 0;
    re.lastIndex = 0;
    let m = re.exec(text);
    let changed = false;
    while (m) {
      if (m[0].length === 0) {
        if (re.lastIndex === m.index) re.lastIndex += 1;
        m = re.exec(text);
        continue;
      }
      next += text.slice(last, m.index);
      next += expandReplaceTemplate(replace, m, options);
      last = m.index + m[0].length;
      count += 1;
      changed = true;
      m = re.exec(text);
    }
    if (changed) {
      next += text.slice(last);
      setItemText(item, next);
    }
  }
  return count;
}
