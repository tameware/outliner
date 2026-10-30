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
 * Outline display name from an on-disk OPML file name (strips .opml).
 * @param {string | null | undefined} name
 * @returns {string}
 */
export function titleFromOpmlFileName(name) {
  return String(name ?? '')
    .trim()
    .replace(/\.opml$/i, '')
    .trim();
}

/**
 * File → Open (local or Drive) uses the file name as the outline name, not
 * `<head><title>`. Falls back to the OPML title only when the file name is
 * missing or just `.opml`.
 *
 * @param {string | null | undefined} fileName
 * @param {string | null | undefined} opmlTitle
 * @returns {string}
 */
export function outlineTitleFromFileName(fileName, opmlTitle) {
  return titleFromOpmlFileName(fileName) || String(opmlTitle ?? '').trim();
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

/**
 * Save locally via File System Access when available. Never falls back to a
 * forced download after the save picker is cancelled or fails — that made
 * Cancel still download the OPML.
 *
 * @param {{
 *   contents: string,
 *   suggestedName?: string,
 *   existingHandle?: FileSystemFileHandle | null,
 *   forcePicker?: boolean,
 *   supportsFsa?: boolean,
 *   saveWithPicker?: typeof saveOpmlWithFilePicker,
 *   writeToHandle?: typeof writeOpmlToFileHandle,
 *   download?: (contents: string, filename: string) => void,
 * }} options
 * @returns {Promise<{
 *   ok: boolean,
 *   reason: 'handle' | 'picker' | 'download' | 'cancelled',
 *   handle: FileSystemFileHandle | null,
 * }>}
 */
export async function saveOutlineLocally({
  contents,
  suggestedName = 'outline.opml',
  existingHandle = null,
  forcePicker = false,
  supportsFsa = supportsFileSystemAccess(),
  saveWithPicker = saveOpmlWithFilePicker,
  writeToHandle = writeOpmlToFileHandle,
  download,
} = {}) {
  if (supportsFsa) {
    try {
      if (existingHandle && !forcePicker) {
        await writeToHandle(existingHandle, contents);
        return { ok: true, reason: 'handle', handle: existingHandle };
      }
      const handle = await saveWithPicker(contents, { suggestedName });
      if (!handle) return { ok: false, reason: 'cancelled', handle: null };
      return { ok: true, reason: 'picker', handle };
    } catch (error) {
      // Cancel and embed/picker failures must not force a download.
      if (isAbortError(error) || isFilePickerUnavailableError(error)) {
        return { ok: false, reason: 'cancelled', handle: null };
      }
      throw error;
    }
  }
  download?.(contents, suggestedName);
  return { ok: true, reason: 'download', handle: null };
}
