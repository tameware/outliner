/**
 * Autolink http(s) / www URLs inside outline lines.
 */

/** @typedef {{ start: number, end: number, text: string }} WebLinkRange */

const WEB_LINK_RE = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi;
const TRAILING_PUNCT_RE = /[.,;:!?)]+$/;

/**
 * @param {string | null | undefined} matched
 * @returns {string}
 */
export function trimWebLinkText(matched) {
  return String(matched ?? '').replace(TRAILING_PUNCT_RE, '');
}

/**
 * @param {string | null | undefined} text
 * @returns {string}
 */
export function hrefForWebLink(text) {
  const value = String(text ?? '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^www\./i.test(value)) return `https://${value}`;
  return value;
}

/**
 * @param {string | null | undefined} text
 * @returns {WebLinkRange[]}
 */
export function findWebLinks(text) {
  const value = String(text ?? '');
  /** @type {WebLinkRange[]} */
  const links = [];
  WEB_LINK_RE.lastIndex = 0;
  let match = WEB_LINK_RE.exec(value);
  while (match) {
    const raw = match[0];
    const trimmed = trimWebLinkText(raw);
    if (trimmed) {
      links.push({
        start: match.index,
        end: match.index + trimmed.length,
        text: trimmed,
      });
    }
    match = WEB_LINK_RE.exec(value);
  }
  return links;
}

/**
 * @param {string} text
 * @returns {HTMLAnchorElement}
 */
export function createOutlineLink(text) {
  const a = document.createElement('a');
  a.className = 'outline-link';
  a.href = hrefForWebLink(text);
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.setAttribute('contenteditable', 'false');
  a.textContent = text;
  return a;
}

/**
 * Keep typed URLs clickable after the line loses focus.
 * @param {HTMLElement} root
 * @param {{ fillLine: (el: HTMLElement, text: string) => void }} options
 */
export function bindOutlineLinks(root, options) {
  if (!root) return () => {};
  const fillLine = options?.fillLine;
  if (typeof fillLine !== 'function') return () => {};

  function onClick(event) {
    const link = event.target?.closest?.('a.outline-link');
    if (!link || !root.contains(link)) return;
    const href = link.getAttribute('href');
    if (!href) return;
    event.preventDefault();
    event.stopPropagation();
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  function onFocusOut(event) {
    const textEl = event.target?.closest?.('.text');
    if (!textEl || !root.contains(textEl)) return;
    // Skip when focus stays inside the same line (e.g. moving into a child control).
    const next = event.relatedTarget;
    if (next && textEl.contains(/** @type {Node} */ (next))) return;
    const value = textEl.textContent ?? '';
    if (!findWebLinks(value).length && !textEl.querySelector('a.outline-link')) {
      return;
    }
    fillLine(textEl, value);
  }

  root.addEventListener('click', onClick);
  root.addEventListener('focusout', onFocusOut);
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('focusout', onFocusOut);
  };
}
