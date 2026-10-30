import {
  boot,
  promoteChildren,
  demoteFollowingSiblings,
  moveItemUp,
  moveItemDown,
  toggleItem,
  focusItem,
  downloadOpml,
  readOpmlFile,
  loadOutline,
  insertOutline,
  toOpml,
  parseOpml,
  setReadOnly,
  clearOutline,
  applyOpenExpansion,
} from './outliner.js';
import {
  isCloudConfigured,
  googleClientIdFromConfig,
  driveWriterServiceAccountFromConfig,
  loadCloudConfig,
  outlineIdFromLocation,
  locationWithOutlineId,
  isReadOnlyViewFromLocation,
  isEditableShareFromLocation,
  viewTokenFromLocation,
  editTokenFromLocation,
} from './cloud.js';
import { createDriveCloudClient } from './drive-cloud.js';
import { mountCloudUi } from './cloud-ui.js';
import { createGoogleAuth, createNullAuth } from './auth-google.js';
import { applyReadOnlyToolbar } from './readonly-toolbar.js';
import { createOutlineHistory } from './clear-outline-ui.js';
import { handlePromoteDemoteShortcut } from './promote-demote-keys.js';
import { handleMoveUpDownShortcut } from './move-up-down-keys.js';
import { systemBeep } from './system-beep.js';
import { mountIndentOutdentMenu } from './indent-outdent-menu.js';
import { mountMoveUpDownMenu } from './move-up-down-menu.js';
import { mountFindReplace } from './find-replace-ui.js';
import { blankOutlineForDeepLink } from './deep-link-boot.js';
import {
  bindDeepLinkOutlineLoad,
  isSoftDeepLinkLoadError,
} from './deep-link-load.js';
import {
  showOutlineLoading,
  hideOutlineLoading,
  isOutlineLoading,
} from './outline-loading.js';
import { clearCloudOutlineBinding } from './cloud-binding.js';
import { mountMenubar } from './menubar.js';
import { mountOutlinerMenu } from './outliner-menu.js';
import { applyMenuShortcuts } from './menu-shortcuts.js';
import {
  documentTitleLabel,
  stripDirtyTitleSuffix,
  syncDocumentTitleDisplay,
  syncDocumentUpdatedDisplay,
  coerceDocumentUpdatedAt,
  mountDocumentTitleEditor,
} from './document-title.js';
import {
  focusOutlineItem,
  unfocusOutline,
  isOutlineFocusActive,
} from './outline-focus.js';
import { createDirtyTracker } from './dirty-tracker.js';
import {
  offerSaveIfDirty,
  mountUnsavedChangesDialog,
  bindBeforeUnloadGuard,
} from './unsaved-changes.js';
import {
  revertToCleanSnapshot,
  syncRevertMenuItem,
} from './revert-outline.js';
import {
  supportsFileSystemAccess,
  localSaveMenuLabel,
  suggestedOpmlFilename,
  outlineTitleFromFileName,
  openOpmlWithFilePicker,
  saveOutlineLocally,
  isAbortError,
  isFilePickerUnavailableError,
} from './local-file.js';

const rootEl = document.querySelector('[data-outline-root]');
const menubar = document.querySelector('.menubar');
const documentTitleEl = document.getElementById('document-title');
const documentUpdatedEl = document.getElementById('document-updated');

/** @type {Date | null} */
let documentUpdatedAt = null;

function outlineTitleBase() {
  return documentTitleLabel(stripDirtyTitleSuffix(document.title));
}

function syncDocumentTitles() {
  // Share / deep-link opens: keep the heading blank until the real name arrives.
  if (isOutlineLoading(root)) {
    if (documentTitleEl) documentTitleEl.textContent = '';
    return;
  }
  syncDocumentTitleDisplay(documentTitleEl, outlineTitleBase(), {
    dirty: dirty.isDirty(),
    syncTabTitle: true,
  });
}

function applyDocumentTitle(title) {
  const next = stripDirtyTitleSuffix(String(title ?? '')).trim();
  if (next) document.title = documentTitleLabel(next);
  syncDocumentTitles();
}

/**
 * @param {Date | string | number | null | undefined} date
 */
function applyDocumentUpdated(date) {
  documentUpdatedAt = coerceDocumentUpdatedAt(date);
  syncDocumentUpdatedDisplay(documentUpdatedEl, documentUpdatedAt);
}

mountMenubar(menubar);
const outlinerMenuUi = mountOutlinerMenu(document, {
  outlineRoot: rootEl,
});
applyMenuShortcuts(document);
syncDocumentUpdatedDisplay(documentUpdatedEl, null);

const outlineHistory = createOutlineHistory({
  getRoot: () => rootEl,
  button: document.getElementById('menu-clear'),
  undoButton: document.getElementById('menu-undo'),
  redoButton: document.getElementById('menu-redo'),
  toOpml,
  parseOpml,
  loadOutline,
  clearOutline,
  getTitle: () => outlineTitleBase(),
  setTitle: (title) => {
    applyDocumentTitle(title);
  },
  maxDepth: 50,
  onChange: () => {
    // Called after dirty exists; syncRevert is a function declaration (hoisted).
    syncRevert();
  },
});

const api = boot('[data-outline-root]', {
  runStructural: (mutate) => outlineHistory.run(mutate),
});
window.__outlinerApi = api;
const root = api.root;
outlineHistory.bindShortcuts(root);

let currentOutlineId = outlineIdFromLocation(window.location);
let currentRevision = null;
let leaseToken = null;
const viewShareToken = viewTokenFromLocation(window.location);
const editShareToken = editTokenFromLocation(window.location);
const readOnlyShare = isReadOnlyViewFromLocation(window.location);
const editShareMode = isEditableShareFromLocation(window.location);
/** @type {{ saveCurrent: () => Promise<boolean> } | null} */
let cloudUi = null;
let cloudSaveAvailable = false;

const dirty = createDirtyTracker({
  getContentSnapshot: () =>
    toOpml(root, {
      title: outlineTitleBase(),
      includeExpansionState: false,
    }),
  getRevertSnapshot: () => toOpml(root, { title: outlineTitleBase() }),
});
const askUnsavedChanges = mountUnsavedChangesDialog(
  document.getElementById('unsaved-dialog'),
);

async function saveBeforeReplace() {
  if (cloudSaveAvailable && cloudUi?.saveCurrent) {
    return cloudUi.saveCurrent();
  }
  return saveLocalOutline();
}

async function beforeReplace() {
  const result = await offerSaveIfDirty({
    isDirty: () => dirty.isDirty(),
    save: saveBeforeReplace,
    ask: askUnsavedChanges,
  });
  return result === 'proceed';
}

// Avoid flashing the starter outline while ?id= / ?view= / ?edit= content loads.
if (blankOutlineForDeepLink(root, window.location, { loadOutline })) {
  outlineHistory.discard();
} else {
  applyOpenExpansion(root);
}
dirty.markClean();
syncDocumentTitles();
mountDocumentTitleEditor(documentTitleEl, {
  onCommit: (title) => {
    applyDocumentTitle(title);
    syncRevert();
  },
  isReadOnly: () => root.dataset.readonly === 'true',
});
bindBeforeUnloadGuard(window, () => dirty.isDirty());

function syncUrl(id) {
  currentOutlineId = id;
  // Owner bookmarks use ?id= only; keep opaque ?view= / ?edit= share URLs intact.
  if (viewShareToken || editShareToken) return;
  const next = locationWithOutlineId(window.location, id);
  window.history.replaceState(null, '', next);
}

// Keep outline focus when using the menubar / cloud chrome (including menu labels).
document
  .querySelectorAll('.menubar .menu-label, .menubar [role="menuitem"], .cloud-bar button')
  .forEach((btn) => {
    btn.addEventListener('mousedown', (event) => event.preventDefault());
  });

/** @param {'promote' | 'demote'} action */
function runPromoteDemote(action) {
  const item = api.getActiveItem();
  if (!item) return false;
  return outlineHistory.run(() =>
    action === 'promote' ? promoteChildren(item) : demoteFollowingSiblings(item),
  );
}

/** @param {'up' | 'down'} action */
function runMoveUpDown(action) {
  const item = api.getActiveItem();
  if (!item) return false;
  return outlineHistory.run(() =>
    action === 'up' ? moveItemUp(item) : moveItemDown(item),
  );
}

document.getElementById('menu-undo').addEventListener('click', () => {
  if (root.dataset.readonly === 'true') return;
  outlineHistory.undo();
});
document.getElementById('menu-redo').addEventListener('click', () => {
  if (root.dataset.readonly === 'true') return;
  outlineHistory.redo();
});
mountIndentOutdentMenu({
  indentButton: document.getElementById('menu-indent'),
  outdentButton: document.getElementById('menu-outdent'),
  getActiveItem: () => api.getActiveItem(),
  runStructural: (mutate) => outlineHistory.run(mutate),
  isReadOnly: () => root.dataset.readonly === 'true',
});

mountMoveUpDownMenu({
  upButton: document.getElementById('menu-move-up'),
  downButton: document.getElementById('menu-move-down'),
  getActiveItem: () => api.getActiveItem(),
  runStructural: (mutate) => outlineHistory.run(mutate),
  isReadOnly: () => root.dataset.readonly === 'true',
  beep: systemBeep,
});

mountFindReplace({
  dialog: document.getElementById('find-replace-dialog'),
  findButton: document.getElementById('menu-find'),
  replaceButton: document.getElementById('menu-replace'),
  getRoot: () => root,
  getActiveItem: () => api.getActiveItem(),
  runStructural: (mutate) => outlineHistory.run(mutate),
  isReadOnly: () => root.dataset.readonly === 'true',
  beep: systemBeep,
});

document.getElementById('menu-promote').addEventListener('click', () => {
  if (root.dataset.readonly === 'true') return;
  if (!runPromoteDemote('promote')) systemBeep();
});
document.getElementById('menu-demote').addEventListener('click', () => {
  if (root.dataset.readonly === 'true') return;
  if (!runPromoteDemote('demote')) systemBeep();
});

document.addEventListener(
  'keydown',
  (event) => {
    handlePromoteDemoteShortcut(event, {
      run: runPromoteDemote,
      beep: systemBeep,
      isReadOnly: () => root.dataset.readonly === 'true',
    });
    handleMoveUpDownShortcut(event, {
      run: runMoveUpDown,
      beep: systemBeep,
      isReadOnly: () => root.dataset.readonly === 'true',
    });
  },
  true,
);

const focusButton = document.getElementById('menu-focus');
const unfocusButton = document.getElementById('menu-unfocus');

function syncFocusMenus() {
  if (unfocusButton) unfocusButton.disabled = !isOutlineFocusActive(root);
}

focusButton?.addEventListener('click', () => {
  const item = api.getActiveItem?.();
  if (!item) {
    systemBeep();
    return;
  }
  if (!focusOutlineItem(root, item)) {
    systemBeep();
    return;
  }
  if (item.dataset.hasChildren === 'true' && item.dataset.state === 'collapsed') {
    toggleItem(item);
  }
  syncFocusMenus();
});

unfocusButton?.addEventListener('click', () => {
  if (!unfocusOutline(root)) {
    systemBeep();
    return;
  }
  syncFocusMenus();
});

syncFocusMenus();

document.getElementById('menu-expand-all').addEventListener('click', () => {
  root.querySelectorAll('[data-item][data-has-children="true"]').forEach((item) => {
    if (item.dataset.state === 'collapsed') toggleItem(item);
  });
});
document.getElementById('menu-collapse-all').addEventListener('click', () => {
  root.querySelectorAll('[data-item][data-has-children="true"]').forEach((item) => {
    if (item.dataset.state !== 'collapsed') toggleItem(item);
  });
});

document.getElementById('menu-clear').addEventListener('click', () => {
  if (root.dataset.readonly === 'true') return;
  outlineHistory.clear();
  clearLocalFileHandle();
  syncFocusMenus();
  const first = root.querySelector('[data-item]');
  if (first) focusItem(first);
});

const fileInput = document.getElementById('file-open');
const fileSaveButton = document.getElementById('menu-file-save');

/** @type {FileSystemFileHandle | null} */
let localFileHandle = null;

function clearLocalFileHandle() {
  localFileHandle = null;
  syncLocalSaveLabel();
}

function syncLocalSaveLabel() {
  if (fileSaveButton) {
    fileSaveButton.textContent = localSaveMenuLabel(Boolean(localFileHandle));
  }
}

syncLocalSaveLabel();

/**
 * @param {{ title?: string, items?: unknown[], dateModified?: Date | null }} tree
 * @param {string} [fallbackName]
 * @param {{ updatedAt?: Date | string | number | null }} [meta]
 */
function applyOpenedLocalOutline(tree, fallbackName, meta = {}) {
  hideOutlineLoading(root);
  // File Open replaces the document — do not overwrite the previously opened Drive file.
  clearCloudOutlineBinding({
    setOutlineId: (id) => {
      currentOutlineId = id;
    },
    setRevision: (rev) => {
      currentRevision = rev;
    },
    setLeaseToken: (token) => {
      leaseToken = token;
    },
    syncUrl,
  });
  cloudUi?.syncSaveLabel?.();
  loadOutline(root, tree);
  applyOpenExpansion(root);
  outlineHistory.discard();
  const title = outlineTitleFromFileName(fallbackName, tree.title);
  if (title) applyDocumentTitle(title);
  applyDocumentUpdated(meta.updatedAt ?? tree.dateModified ?? null);
  dirty.markClean();
  syncFocusMenus();
  syncRevert();
  outlinerMenuUi.syncHelpEnabled();
  const firstItem = root.querySelector('[data-item]');
  if (firstItem) focusItem(firstItem);
}

function triggerLegacyFileOpen(mode = 'replace') {
  fileOpenMode = mode;
  fileInput.click();
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
 * @param {{ forcePicker?: boolean }} [options]
 * @returns {Promise<boolean>}
 */
async function saveLocalOutline({ forcePicker = false } = {}) {
  const title = outlineTitleBase();
  const updatedAt = new Date();
  const opml = toOpml(root, { title, dateModified: updatedAt });
  const filename = suggestedOpmlFilename(title);

  try {
    const result = await saveOutlineLocally({
      contents: opml,
      suggestedName: filename,
      existingHandle: localFileHandle,
      forcePicker,
      download: () =>
        downloadOpml(root, { title, filename, dateModified: updatedAt }),
    });
    if (!result.ok) return false;
    if (result.handle) {
      localFileHandle = result.handle;
      syncLocalSaveLabel();
    }
    applyDocumentUpdated(updatedAt);
    dirty.markClean();
    syncRevert();
    return true;
  } catch (error) {
    window.alert('Could not save OPML file: ' + (error?.message || error));
    return false;
  }
}

document.getElementById('menu-file-open')?.addEventListener('click', () => {
  void openLocalOutline();
});

document.getElementById('menu-file-save')?.addEventListener('click', () => {
  void saveLocalOutline();
});

document.getElementById('menu-file-save-as')?.addEventListener('click', () => {
  void saveLocalOutline({ forcePicker: true });
});

const revertButtons = [
  document.getElementById('menu-revert'),
  document.getElementById('menu-cloud-revert'),
].filter(Boolean);

function syncRevert() {
  const dirtyNow = () => dirty.isDirty();
  for (const btn of revertButtons) {
    if (root.dataset.readonly === 'true') {
      btn.disabled = true;
      continue;
    }
    syncRevertMenuItem(btn, dirtyNow);
  }
  syncDocumentTitles();
}
syncRevert();
document
  .querySelector('[data-menu="file"] .menu-label')
  ?.addEventListener('click', syncRevert);
document
  .querySelector('[data-menu="cloud"] .menu-label')
  ?.addEventListener('click', syncRevert);
root.addEventListener('input', () => {
  applyDocumentUpdated(new Date());
  syncRevert();
});

function onRevert() {
  if (root.dataset.readonly === 'true') return;
  const ok = revertToCleanSnapshot({
    isDirty: () => dirty.isDirty(),
    getBaseline: () => dirty.getBaseline(),
    getRoot: () => root,
    parseOpml,
    loadOutline,
    setTitle: (title) => {
      applyDocumentTitle(title);
    },
    run: (mutate) => outlineHistory.run(mutate),
  });
  if (ok) {
    syncFocusMenus();
    const first = root.querySelector('[data-item]');
    if (first) focusItem(first);
  }
  syncRevert();
}

document.getElementById('menu-revert')?.addEventListener('click', onRevert);
document.getElementById('menu-cloud-revert')?.addEventListener('click', onRevert);

/** @type {'replace' | 'insert'} */
let fileOpenMode = 'replace';

document.getElementById('menu-insert-import')?.addEventListener('click', () => {
  if (root.dataset.readonly === 'true') return;
  if (supportsFileSystemAccess()) {
    void (async () => {
      try {
        const picked = await openOpmlWithFilePicker();
        if (!picked) return;
        const tree = parseOpml(picked.text);
        outlineHistory.run(() => {
          const after = api.getActiveItem?.() ?? null;
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
    })();
    return;
  }
  triggerLegacyFileOpen('insert');
});

fileInput.addEventListener('change', async () => {
  if (root.dataset.readonly === 'true') return;
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  const mode = fileOpenMode;
  fileOpenMode = 'replace';
  try {
    if (mode === 'replace') showOutlineLoading(root, { loadOutline });
    const tree = await readOpmlFile(file);
    if (mode === 'insert') {
      outlineHistory.run(() => {
        const after = api.getActiveItem?.() ?? null;
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
});

const first = root.querySelector('[data-item]');
if (first) focusItem(first);

async function initCloud() {
  const cloudConfig = await loadCloudConfig();
  const configured = isCloudConfigured(cloudConfig);
  let auth = createNullAuth();
  let cloud = null;

  if (configured) {
    auth = createGoogleAuth({ clientId: googleClientIdFromConfig(cloudConfig) });
    cloud = createDriveCloudClient({
      getAccessToken: () => auth.getAccessToken(),
      driveWriterServiceAccount: driveWriterServiceAccountFromConfig(cloudConfig),
      shareAccess: editShareToken
        ? { mode: 'edit', token: editShareToken }
        : viewShareToken
          ? { mode: 'view', token: viewShareToken }
          : null,
    });
  }

  const nullCloud = {
    async listOutlines() { return []; },
    async getOutline() { return { opml: '', revision: null }; },
    async createOutline() { return { id: 'local' }; },
    async saveOutline() { return {}; },
    async acquireLock() { return { token: '' }; },
    async releaseLock() {},
    async createShareLink() { return { token: '', urlPath: '' }; },
    async createEditShareLink() { return { token: '', urlPath: '' }; },
    async deleteOutline() {},
  };

  cloudSaveAvailable = configured;
  cloudUi = mountCloudUi({
    configured,
    readOnlyView: readOnlyShare,
    editShareMode,
    auth,
    cloud: cloud || nullCloud,
    outline: {
      root,
      toOpml: () =>
        toOpml(root, {
          title: outlineTitleBase(),
          dateModified: documentUpdatedAt ?? new Date(),
        }),
      parseOpml,
      beginLoading: () => {
        showOutlineLoading(root, { loadOutline });
        outlineHistory.discard();
        dirty.markClean();
        syncDocumentTitles();
      },
      hideLoading: () => {
        hideOutlineLoading(root);
      },
      loadOutline: (tree) => {
        hideOutlineLoading(root);
        clearLocalFileHandle();
        loadOutline(root, tree);
        applyOpenExpansion(root);
        outlineHistory.discard();
        // Title comes from the Drive file name via setTitle (not OPML <head><title>).
        applyDocumentUpdated(tree.dateModified ?? documentUpdatedAt);
        syncFocusMenus();
        outlinerMenuUi.syncHelpEnabled();
        const item = root.querySelector('[data-item]');
        if (item) focusItem(item);
      },
      setUpdatedAt: (date) => {
        applyDocumentUpdated(date);
      },
      insertOutline: (tree) => {
        outlineHistory.run(() => {
          const after = api.getActiveItem?.() ?? null;
          return Boolean(insertOutline(root, tree, after));
        });
        syncRevert();
      },
      getTitle: () => outlineTitleBase(),
      setTitle: (title) => {
        applyDocumentTitle(title);
      },
      getOutlineId: () => currentOutlineId,
      setOutlineId: (id) => {
        currentOutlineId = id;
      },
      getRevision: () => currentRevision,
      setRevision: (rev) => {
        currentRevision = rev;
      },
      getLeaseToken: () => leaseToken,
      setLeaseToken: (token) => {
        leaseToken = token;
      },
      syncUrl: (id) => syncUrl(id),
      beforeReplace,
      isDirty: () => dirty.isDirty(),
      markClean: () => {
        dirty.markClean();
        syncDocumentTitles();
      },
    },
  });

  if (readOnlyShare) {
    setReadOnly(root, true);
    applyReadOnlyToolbar(document.querySelector('.menubar'));
  }

  const deepLinkKey = editShareToken || viewShareToken || currentOutlineId;
  if (configured && cloud && deepLinkKey) {
    // Eager load (public anyone-with-link or existing token). Also retry when
    // auth later delivers a signed-in user — do not depend only on a change event.
    bindDeepLinkOutlineLoad({
      auth,
      cloud,
      getOutlineId: () =>
        editShareToken || viewShareToken || currentOutlineId,
      applyOutline: async (got) => {
        const tree = parseOpml(got.opml);
        hideOutlineLoading(root);
        loadOutline(root, tree);
        applyOpenExpansion(root);
        clearLocalFileHandle();
        outlinerMenuUi.syncHelpEnabled();
        const title = outlineTitleFromFileName(got.title, tree.title);
        if (title) applyDocumentTitle(title);
        applyDocumentUpdated(got.modifiedTime ?? tree.dateModified ?? null);
        // Match Cloud Open: keep currentOutlineId + owner ?id= URL in sync.
        // Share ?view= / ?edit= URLs stay opaque (syncUrl no-ops the history rewrite).
        if (got.fileId) syncUrl(got.fileId);
        currentRevision = got.revision ?? null;
        leaseToken = null;
        dirty.markClean();
        syncDocumentTitles();
        syncFocusMenus();
        if (readOnlyShare) {
          setReadOnly(root, true);
          applyReadOnlyToolbar(document.querySelector('.menubar'));
        }
        const item = root.querySelector('[data-item]');
        if (item) focusItem(item);
      },
      onError: (error) => {
        console.warn('Could not load outline from Google Drive', error);
        // 401 / Failed to fetch: wait for proxy success or sign-in retry.
        if (isSoftDeepLinkLoadError(error)) return;
        hideOutlineLoading(root);
        window.alert(
          'Could not open outline from Google Drive: ' + (error?.message || error),
        );
      },
    });
  }
}

void initCloud();
