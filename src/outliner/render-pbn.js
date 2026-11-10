/**
 * Snapshot the outline and open a read-only tab with PBN deals rendered as diagrams.
 */

import {
  countDealLinesInRoot,
  replaceDealLinesWithDiagrams,
} from './deal-diagram.js';

export const PBN_RENDER_STORAGE_PREFIX = 'outliner-pbn-render:';

/**
 * @param {{ search?: string } | Location | URL} locationLike
 */
export function isPbnRenderLocation(locationLike) {
  const params = new URLSearchParams(locationLike?.search || '');
  return params.get('render') === 'pbn' && Boolean(params.get('k'));
}

/**
 * @param {{ search?: string } | Location | URL} locationLike
 * @returns {string}
 */
export function pbnRenderKeyFromLocation(locationLike) {
  return new URLSearchParams(locationLike?.search || '').get('k') || '';
}

/**
 * New tabs do not share sessionStorage with the opener; use localStorage.
 * @returns {Storage}
 */
function defaultSharedStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== 'undefined') return localStorage;
  throw new Error('localStorage is not available');
}

/**
 * @param {{ title?: string, opml: string }} snapshot
 * @param {Storage} [storage]
 * @returns {string} storage key suffix
 */
export function storePbnRenderSnapshot(snapshot, storage) {
  const store = storage ?? defaultSharedStorage();
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  store.setItem(
    PBN_RENDER_STORAGE_PREFIX + key,
    JSON.stringify({
      title: snapshot?.title ?? '',
      opml: snapshot?.opml ?? '',
    }),
  );
  return key;
}

/**
 * Read and remove a one-shot snapshot.
 * @param {string} key
 * @param {Storage} [storage]
 * @returns {{ title: string, opml: string } | null}
 */
export function takePbnRenderSnapshot(key, storage) {
  if (!key) return null;
  const store = storage ?? defaultSharedStorage();
  const raw = store.getItem(PBN_RENDER_STORAGE_PREFIX + key);
  if (raw == null) return null;
  store.removeItem(PBN_RENDER_STORAGE_PREFIX + key);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.opml !== 'string') return null;
    return { title: String(parsed.title ?? ''), opml: parsed.opml };
  } catch {
    return null;
  }
}

/** Shown when ?render=pbn opens without a usable snapshot. */
export const PBN_RENDER_MISSING_MESSAGE =
  'PBN render snapshot was missing or expired. Close this tab and choose View → Render PBN again.';

/**
 * @param {{ href?: string } | Location | URL} locationLike
 * @param {string} key
 * @returns {string}
 */
export function buildPbnRenderHref(locationLike, key) {
  const url = new URL(locationLike?.href || 'http://localhost/');
  url.search = '';
  url.searchParams.set('render', 'pbn');
  url.searchParams.set('k', key);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * @param {{
 *   root: HTMLElement,
 *   toOpml: (root: HTMLElement, opts?: object) => string,
 *   getTitle?: () => string,
 *   openWindow?: typeof window.open,
 *   storage?: Storage,
 *   locationLike?: Location | URL | { href?: string },
 *   beep?: () => void,
 * }} opts
 * @returns {Window | null}
 */
export function openPbnRenderTab({
  root,
  toOpml,
  getTitle,
  openWindow = (...args) => window.open(...args),
  storage,
  locationLike = typeof window !== 'undefined' ? window.location : undefined,
  beep = () => {},
} = {}) {
  if (!root || typeof toOpml !== 'function' || countDealLinesInRoot(root) === 0) {
    beep();
    return null;
  }
  const title = getTitle?.() || 'Outline';
  const opml = toOpml(root, { title, includeExpansionState: true });
  const key = storePbnRenderSnapshot({ title, opml }, storage);
  const href = buildPbnRenderHref(locationLike, key);
  return openWindow(href, '_blank', 'noopener,noreferrer');
}

/**
 * @param {string} title
 * @returns {string}
 */
export function pbnRenderDocumentTitle(title) {
  const base = String(title || 'Outline').trim() || 'Outline';
  return /\(PBN\)\s*$/.test(base) ? base : `${base} (PBN)`;
}

/**
 * @param {{
 *   root: HTMLElement,
 *   snapshot: { title?: string, opml: string } | null,
 *   parseOpml: (opml: string) => { title?: string, items?: unknown[] },
 *   loadOutline: Function,
 *   setReadOnly?: Function,
 *   applyReadOnlyToolbar?: Function,
 *   applyDocumentTitle?: (title: string) => void,
 *   menubar?: ParentNode | null,
 *   replaceDealLines?: (root: HTMLElement) => number,
 * }} opts
 * @returns {boolean}
 */
export function applyPbnRenderSnapshot({
  root,
  snapshot,
  parseOpml,
  loadOutline,
  setReadOnly,
  applyReadOnlyToolbar,
  applyDocumentTitle,
  menubar,
  replaceDealLines = replaceDealLinesWithDiagrams,
} = {}) {
  if (!root || !snapshot?.opml || typeof parseOpml !== 'function') return false;
  const tree = parseOpml(snapshot.opml);
  loadOutline(root, tree);
  replaceDealLines(root);
  setReadOnly?.(root, true);
  if (menubar) applyReadOnlyToolbar?.(menubar);
  const title = pbnRenderDocumentTitle(
    snapshot.title || tree?.title || 'Outline',
  );
  applyDocumentTitle?.(title);
  return true;
}

/**
 * Empty read-only placeholder when the snapshot key is gone.
 * @param {{
 *   root: HTMLElement,
 *   loadOutline: Function,
 *   setReadOnly?: Function,
 *   applyReadOnlyToolbar?: Function,
 *   applyDocumentTitle?: (title: string) => void,
 *   menubar?: ParentNode | null,
 *   message?: string,
 * }} opts
 */
export function applyMissingPbnRenderSnapshot({
  root,
  loadOutline,
  setReadOnly,
  applyReadOnlyToolbar,
  applyDocumentTitle,
  menubar,
  message = PBN_RENDER_MISSING_MESSAGE,
} = {}) {
  if (!root || typeof loadOutline !== 'function') return;
  loadOutline(root, { items: [{ text: message, children: [] }] });
  setReadOnly?.(root, true);
  if (menubar) applyReadOnlyToolbar?.(menubar);
  applyDocumentTitle?.(pbnRenderDocumentTitle('PBN render'));
}
