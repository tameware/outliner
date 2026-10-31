/**
 * Paste into outline lines as plain text so the default outline font always applies
 * (browsers otherwise insert rich HTML with foreign font-family styles).
 */

import { fillTextWithSuits } from './suit-shortcuts.js';

/**
 * @param {DataTransfer | null | undefined} clipboardData
 * @returns {string}
 */
export function clipboardPlainText(clipboardData) {
  if (!clipboardData?.getData) return '';
  const plain = clipboardData.getData('text/plain');
  if (plain) return plain;
  const html = clipboardData.getData('text/html');
  if (!html) return '';
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]+>/g, '');
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body?.textContent ?? '';
}

/**
 * UTF-16 offsets of the current selection inside a contenteditable line.
 * @param {HTMLElement} textEl
 * @returns {{ start: number, end: number } | null}
 */
export function selectionOffsetsIn(textEl) {
  const sel = window.getSelection?.();
  if (!sel?.rangeCount || !textEl) return null;
  const range = sel.getRangeAt(0);
  if (!textEl.contains(range.startContainer) && range.startContainer !== textEl) {
    return null;
  }
  if (!textEl.contains(range.endContainer) && range.endContainer !== textEl) {
    return null;
  }
  const preStart = range.cloneRange();
  preStart.selectNodeContents(textEl);
  preStart.setEnd(range.startContainer, range.startOffset);
  const start = preStart.toString().length;
  const preEnd = range.cloneRange();
  preEnd.selectNodeContents(textEl);
  preEnd.setEnd(range.endContainer, range.endOffset);
  const end = preEnd.toString().length;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

/**
 * Place a collapsed caret at a UTF-16 offset within a contenteditable line.
 * @param {HTMLElement} el
 * @param {number} offset
 */
function setCaretAtTextOffset(el, offset) {
  el.focus?.();
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
 * Replace the selection (or insert at the caret) with plain text using the
 * outline’s default font / suit wrapping — never rich font HTML.
 * @param {HTMLElement} textEl
 * @param {string} pasted
 */
export function pastePlainTextIntoLine(textEl, pasted) {
  if (!textEl) return;
  const offsets = selectionOffsetsIn(textEl) ?? {
    start: (textEl.textContent || '').length,
    end: (textEl.textContent || '').length,
  };
  const full = textEl.textContent || '';
  const next = `${full.slice(0, offsets.start)}${pasted}${full.slice(offsets.end)}`;
  fillTextWithSuits(textEl, next);
  setCaretAtTextOffset(textEl, offsets.start + String(pasted).length);
}

/**
 * @param {ClipboardEvent} event
 * @returns {boolean} true when the event was handled
 */
export function handleOutlinePaste(event) {
  const target = event.target;
  const el =
    target?.nodeType === Node.TEXT_NODE
      ? target.parentElement?.closest?.('.text')
      : target?.closest?.('.text');
  if (!el) return false;
  const root = el.closest('[data-outline-root]');
  if (!root || !root.contains(el)) return false;
  if (el.isContentEditable === false || el.getAttribute('contenteditable') === 'false') {
    return false;
  }
  event.preventDefault();
  pastePlainTextIntoLine(el, clipboardPlainText(event.clipboardData));
  return true;
}

/**
 * @param {ParentNode | null | undefined} root
 */
export function bindOutlinePlainPaste(root) {
  if (!root?.addEventListener) return;
  root.addEventListener('paste', handleOutlinePaste);
}
