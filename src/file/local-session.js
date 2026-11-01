import {
  supportsFileSystemAccess,
  localSaveMenuLabel,
  suggestedOpmlFilename,
  outlineTitleFromFileName,
  openOpmlWithFilePicker,
  saveOutlineLocally as saveOutlineLocallyDefault,
  isAbortError,
  isFilePickerUnavailableError,
} from './local-file.js';
import { shouldSaveUnderNewName, flushDocumentTitleEditor } from '../chrome/document-title.js';
import {
  showOutlineLoading,
  hideOutlineLoading,
} from '../outliner/outline-loading.js';
import { applyOpenExpansion, focusItem, readOpmlFile } from '../outliner/outliner.js';

/**
 * Local OPML open/save session (File System Access + legacy file input).
 *
 * @param {{
 *   root: HTMLElement,
 *   documentTitleEl?: HTMLElement | null,
 *   fileInput?: HTMLInputElement | null,
 *   fileSaveButton?: HTMLElement | null,
 *   dirty: { isDirty: () => boolean, markClean: () => void },
 *   docSession: {
 *     outlineTitleBase: () => string,
 *     rememberBoundTitle: (title?: string) => void,
 *     getBoundTitle: () => string,
 *     applyDocumentTitle: (title: string) => void,
 *     applyDocumentUpdated: (date: unknown) => void,
 *   },
 *   toOpml: Function,
 *   parseOpml: Function,
 *   loadOutline: Function,
 *   downloadOpml: Function,
 *   beforeReplace: () => Promise<boolean>,
 *   syncRevert: () => void,
 *   syncFocusMenus: () => void,
 *   syncHelpEnabled: () => void,
 *   onReplaceDocument: () => void,
 *   getActiveItem: () => HTMLElement | null | undefined,
 *   runStructural: (mutate: () => boolean | void) => boolean | void,
 *   insertOutline: Function,
 *   outlineHistoryDiscard: () => void,
 * }} deps
 */
export function createLocalSession(deps) {
  const {
    root,
    documentTitleEl = null,
    fileInput = null,
    fileSaveButton = null,
    dirty,
    docSession,
    toOpml,
    parseOpml,
    loadOutline,
    downloadOpml,
    beforeReplace,
    syncRevert,
    syncFocusMenus,
    syncHelpEnabled,
    onReplaceDocument,
    getActiveItem,
    runStructural,
    insertOutline,
    outlineHistoryDiscard,
  } = deps;

  /** @type {FileSystemFileHandle | null} */
  let localFileHandle = null;
  /** @type {'replace' | 'insert'} */
  let fileOpenMode = 'replace';

  function syncLocalSaveLabel() {
    if (fileSaveButton) {
      fileSaveButton.textContent = localSaveMenuLabel(Boolean(localFileHandle));
    }
  }

  function clearLocalFileHandle() {
    localFileHandle = null;
    syncLocalSaveLabel();
  }

  /**
   * @param {FileSystemFileHandle | null | undefined} handle
   */
  function setFileHandle(handle) {
    localFileHandle = handle ?? null;
    syncLocalSaveLabel();
  }

  /**
   * @param {{ title?: string, items?: unknown[], dateModified?: Date | null }} tree
   * @param {string} [fallbackName]
   * @param {{ updatedAt?: Date | string | number | null }} [meta]
   */
  function applyOpenedLocalOutline(tree, fallbackName, meta = {}) {
    hideOutlineLoading(root);
    onReplaceDocument();
    loadOutline(root, tree);
    applyOpenExpansion(root);
    outlineHistoryDiscard();
    const title = outlineTitleFromFileName(fallbackName, tree.title);
    if (title) docSession.applyDocumentTitle(title);
    docSession.applyDocumentUpdated(meta.updatedAt ?? tree.dateModified ?? null);
    dirty.markClean();
    docSession.rememberBoundTitle();
    syncFocusMenus();
    syncRevert();
    syncHelpEnabled();
    const firstItem = root.querySelector('[data-item]');
    if (firstItem) focusItem(firstItem);
  }

  function triggerLegacyFileOpen(mode = 'replace') {
    fileOpenMode = mode;
    fileInput?.click();
  }

  async function openLocalOutline() {
    if (root.dataset.readonly === 'true') return;
    // Avoid awaiting when clean — showOpenFilePicker needs the click's user gesture.
    if (dirty.isDirty()) {
      const allow = await beforeReplace();
      if (!allow) return;
    }

    if (supportsFileSystemAccess()) {
      try {
        const picked = await openOpmlWithFilePicker();
        if (!picked) return;
        showOutlineLoading(root, { loadOutline });
        const tree = parseOpml(picked.text);
        localFileHandle = picked.handle;
        syncLocalSaveLabel();
        applyOpenedLocalOutline(tree, picked.name, {
          updatedAt: tree.dateModified ?? picked.lastModified,
        });
        return;
      } catch (error) {
        hideOutlineLoading(root);
        if (isAbortError(error)) return;
        // Cursor's browser and some embeds expose the API but cannot show the picker.
        if (isFilePickerUnavailableError(error)) {
          triggerLegacyFileOpen('replace');
          return;
        }
        window.alert('Could not open OPML file: ' + (error?.message || error));
        return;
      }
    }

    triggerLegacyFileOpen('replace');
  }

  /**
   * @param {{
   *   forcePicker?: boolean,
   *   saveOutlineLocally?: typeof saveOutlineLocallyDefault,
   * }} [options]
   * @returns {Promise<boolean>}
   */
  async function saveLocalOutline(options = {}) {
    const forcePicker = Boolean(options.forcePicker);
    const saveOutlineLocally = options.saveOutlineLocally ?? saveOutlineLocallyDefault;

    flushDocumentTitleEditor(documentTitleEl);
    const title = docSession.outlineTitleBase();
    const updatedAt = new Date();
    const opml = toOpml(root, { title, dateModified: updatedAt });
    const filename = suggestedOpmlFilename(title);
    const saveAsNewName = shouldSaveUnderNewName({
      currentTitle: title,
      boundTitle: docSession.getBoundTitle(),
      hasBinding: Boolean(localFileHandle),
      forceNew: forcePicker,
    });

    try {
      const result = await saveOutlineLocally({
        contents: opml,
        suggestedName: filename,
        existingHandle: localFileHandle,
        forcePicker: forcePicker || saveAsNewName,
        download: () =>
          downloadOpml(root, { title, filename, dateModified: updatedAt }),
      });
      if (!result.ok) return false;
      if (result.handle) {
        localFileHandle = result.handle;
        syncLocalSaveLabel();
      }
      docSession.applyDocumentUpdated(updatedAt);
      dirty.markClean();
      docSession.rememberBoundTitle(title);
      syncRevert();
      return true;
    } catch (error) {
      window.alert('Could not save OPML file: ' + (error?.message || error));
      return false;
    }
  }

  async function insertFromPicker() {
    if (root.dataset.readonly === 'true') return;
    if (supportsFileSystemAccess()) {
      try {
        const picked = await openOpmlWithFilePicker();
        if (!picked) return;
        const tree = parseOpml(picked.text);
        runStructural(() => {
          const after = getActiveItem() ?? null;
          return Boolean(insertOutline(root, tree, after));
        });
        syncRevert();
      } catch (error) {
        if (isAbortError(error)) return;
        if (isFilePickerUnavailableError(error)) {
          triggerLegacyFileOpen('insert');
          return;
        }
        window.alert('Could not open OPML file: ' + (error?.message || error));
      }
      return;
    }
    triggerLegacyFileOpen('insert');
  }

  async function onLegacyFileChosen() {
    if (root.dataset.readonly === 'true') return;
    const file = fileInput?.files?.[0];
    if (fileInput) fileInput.value = '';
    if (!file) return;
    const mode = fileOpenMode;
    fileOpenMode = 'replace';
    try {
      if (mode === 'replace') showOutlineLoading(root, { loadOutline });
      const tree = await readOpmlFile(file);
      if (mode === 'insert') {
        runStructural(() => {
          const after = getActiveItem() ?? null;
          return Boolean(insertOutline(root, tree, after));
        });
        syncRevert();
        return;
      }
      clearLocalFileHandle();
      applyOpenedLocalOutline(tree, file.name, {
        updatedAt: tree.dateModified ?? file.lastModified,
      });
    } catch (error) {
      hideOutlineLoading(root);
      window.alert('Could not open OPML file: ' + (error?.message || error));
    }
  }

  /**
   * @param {{
   *   openButton?: HTMLElement | null,
   *   saveButton?: HTMLElement | null,
   *   saveAsButton?: HTMLElement | null,
   *   insertButton?: HTMLElement | null,
   * }} [menu]
   */
  function bindFileMenus(menu = {}) {
    syncLocalSaveLabel();
    menu.openButton?.addEventListener('click', () => {
      void openLocalOutline();
    });
    menu.saveButton?.addEventListener('click', () => {
      void saveLocalOutline();
    });
    menu.saveAsButton?.addEventListener('click', () => {
      void saveLocalOutline({ forcePicker: true });
    });
    menu.insertButton?.addEventListener('click', () => {
      void insertFromPicker();
    });
    fileInput?.addEventListener('change', () => {
      void onLegacyFileChosen();
    });
  }

  return {
    clearLocalFileHandle,
    setFileHandle,
    syncLocalSaveLabel,
    applyOpenedLocalOutline,
    openLocalOutline,
    saveLocalOutline,
    triggerLegacyFileOpen,
    insertFromPicker,
    bindFileMenus,
  };
}
