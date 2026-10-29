/**
 * Local OPML Open / Save via the File System Access API (with caller fallbacks).
 */

import { APP_DOCUMENT_TITLE } from './document-title.js';

/** @type {FilePickerAcceptType[]} */
export const OPML_FILE_TYPES = [
  {
    description: 'OPML outline',
    accept: {
      'text/x-opml': ['.opml'],
      'application/xml': ['.opml', '.xml'],
      'text/xml': ['.opml', '.xml'],
    },
  },
];

/**
 * @param {Pick<Window, 'showOpenFilePicker' | 'showSaveFilePicker' | 'self' | 'top' | 'navigator'> | null | undefined} [win]
 */
export function supportsFileSystemAccess(win = typeof window !== 'undefined' ? window : undefined) {
  if (
    !win ||
    typeof win.showOpenFilePicker !== 'function' ||
    typeof win.showSaveFilePicker !== 'function'
  ) {
    return false;
  }
  // Embedded Chromium (Electron / many IDE simple browsers) often exposes the
  // API but cannot host a working file picker — prefer <input type="file">.
  const ua = win.navigator?.userAgent || '';
  if (/Electron\b/i.test(ua)) return false;
  try {
    if (win.self !== win.top) return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * @param {boolean} hasHandle
 * @returns {string}
 */
export function localSaveMenuLabel(hasHandle) {
  return hasHandle ? 'Save' : 'Save…';
}

/**
 * @param {string | null | undefined} title
 * @returns {string}
 */
export function suggestedOpmlFilename(title) {
  const trimmed = String(title ?? '').trim();
  if (!trimmed || trimmed === APP_DOCUMENT_TITLE) return 'outline.opml';
  const base = trimmed.replace(/\.opml$/i, '') || 'outline';
  return `${base}.opml`;
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isAbortError(error) {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError');
}

/**
 * True when the File System Access picker cannot run (lost user gesture,
 * embedded browser, permissions) — callers should fall back to <input type=file>.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isFilePickerUnavailableError(error) {
  if (!error || typeof error !== 'object' || !('name' in error)) return false;
  const name = String(error.name);
  return (
    name === 'SecurityError' ||
    name === 'NotAllowedError' ||
    name === 'NotSupportedError' ||
    name === 'TypeError'
  );
}

/**
 * @param {{
 *   showOpenFilePicker?: typeof window.showOpenFilePicker,
 * }} [deps]
 * @returns {Promise<{ handle: FileSystemFileHandle, name: string, text: string } | null>}
 */
export async function openOpmlWithFilePicker(deps = {}) {
  const showOpen =
    deps.showOpenFilePicker ||
    (typeof window !== 'undefined' ? window.showOpenFilePicker?.bind(window) : null);
  if (!showOpen) throw new Error('showOpenFilePicker is not available');
  try {
    const [handle] = await showOpen({
      multiple: false,
      types: OPML_FILE_TYPES,
    });
    const file = await handle.getFile();
    const text = await file.text();
    return { handle, name: file.name || 'outline.opml', text };
  } catch (error) {
    if (isAbortError(error)) return null;
    throw error;
  }
}

/**
 * @param {FileSystemFileHandle} handle
 * @param {string} contents
 */
export async function writeOpmlToFileHandle(handle, contents) {
  const writable = await handle.createWritable();
  await writable.write(contents);
  await writable.close();
}

/**
 * @param {string} contents
 * @param {{
 *   suggestedName?: string,
 *   showSaveFilePicker?: typeof window.showSaveFilePicker,
 * }} [deps]
 * @returns {Promise<FileSystemFileHandle | null>}
 */
export async function saveOpmlWithFilePicker(contents, deps = {}) {
  const showSave =
    deps.showSaveFilePicker ||
    (typeof window !== 'undefined' ? window.showSaveFilePicker?.bind(window) : null);
  if (!showSave) throw new Error('showSaveFilePicker is not available');
  try {
    const handle = await showSave({
      suggestedName: deps.suggestedName || 'outline.opml',
      types: OPML_FILE_TYPES,
    });
    await writeOpmlToFileHandle(handle, contents);
    return handle;
  } catch (error) {
    if (isAbortError(error)) return null;
    throw error;
  }
}
