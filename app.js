import {
  boot,
  promoteChildren,
  demoteFollowingSiblings,
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
import { systemBeep } from './system-beep.js';
import { mountIndentOutdentMenu } from './indent-outdent-menu.js';
import { mountFindReplace } from './find-replace-ui.js';
import { blankOutlineForDeepLink } from './deep-link-boot.js';
import {
  bindDeepLinkOutlineLoad,
  isSoftDeepLinkLoadError,
} from './deep-link-load.js';
import { mountMenubar } from './menubar.js';
import { mountOutlinerMenu } from './outliner-menu.js';
import { applyMenuShortcuts } from './menu-shortcuts.js';
import { syncDocumentTitleDisplay } from './document-title.js';
import { createDirtyTracker } from './dirty-tracker.js';
import {
  offerSaveIfDirty,
  mountUnsavedChangesDialog,
} from './unsaved-changes.js';
import {
  revertToCleanSnapshot,
  syncRevertMenuItem,
} from './revert-outline.js';

const rootEl = document.querySelector('[data-outline-root]');
const menubar = document.querySelector('.menubar');
const documentTitleEl = document.getElementById('document-title');

function applyDocumentTitle(title) {
  const next = String(title ?? '').trim();
  if (next) document.title = next;
  syncDocumentTitleDisplay(documentTitleEl);
}

mountMenubar(menubar);
mountOutlinerMenu(document);
applyMenuShortcuts(document);
syncDocumentTitleDisplay(documentTitleEl);

const outlineHistory = createOutlineHistory({
  getRoot: () => rootEl,
  button: document.getElementById('menu-clear'),
  undoButton: document.getElementById('menu-undo'),
  redoButton: document.getElementById('menu-redo'),
  toOpml,
  parseOpml,
  loadOutline,
  clearOutline,
  getTitle: () => document.title || 'Outline',
  maxDepth: 50,
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
      title: document.title || 'Outline',
      includeExpansionState: false,
    }),
  getRevertSnapshot: () => toOpml(root, { title: document.title || 'Outline' }),
});
const askUnsavedChanges = mountUnsavedChangesDialog(
  document.getElementById('unsaved-dialog'),
);

async function saveBeforeReplace() {
  if (cloudSaveAvailable && cloudUi?.saveCurrent) {
    return cloudUi.saveCurrent();
  }
  const title = document.title || 'Outline';
  downloadOpml(root, { title, filename: 'outline.opml' });
  dirty.markClean();
  return true;
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
}
dirty.markClean();

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
  },
  true,
);

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
  const first = root.querySelector('[data-item]');
  if (first) focusItem(first);
});

const fileInput = document.getElementById('file-open');

document.getElementById('menu-export').addEventListener('click', () => {
  const title = document.title || 'Outline';
  downloadOpml(root, { title, filename: 'outline.opml' });
});

const revertButton = document.getElementById('menu-revert');
function syncRevert() {
  if (root.dataset.readonly === 'true') {
    if (revertButton) revertButton.disabled = true;
    return;
  }
  syncRevertMenuItem(revertButton, () => dirty.isDirty());
}
syncRevert();
document
  .querySelector('[data-menu="file"] .menu-label')
  ?.addEventListener('click', syncRevert);
root.addEventListener('input', syncRevert);

document.getElementById('menu-revert').addEventListener('click', () => {
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
    const first = root.querySelector('[data-item]');
    if (first) focusItem(first);
  }
  syncRevert();
});

/** @type {'replace' | 'insert'} */
let fileOpenMode = 'replace';

document.getElementById('menu-import').addEventListener('click', () => {
  if (root.dataset.readonly === 'true') return;
  void beforeReplace().then((allow) => {
    if (!allow) return;
    fileOpenMode = 'replace';
    fileInput.click();
  });
});

document.getElementById('menu-insert-import').addEventListener('click', () => {
  if (root.dataset.readonly === 'true') return;
  fileOpenMode = 'insert';
  fileInput.click();
});

fileInput.addEventListener('change', async () => {
  if (root.dataset.readonly === 'true') return;
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  const mode = fileOpenMode;
  fileOpenMode = 'replace';
  try {
    const tree = await readOpmlFile(file);
    if (mode === 'insert') {
      outlineHistory.run(() => {
        const after = api.getActiveItem?.() ?? null;
        return Boolean(insertOutline(root, tree, after));
      });
      syncRevert();
      return;
    }
    loadOutline(root, tree);
    outlineHistory.discard();
    if (tree.title) applyDocumentTitle(tree.title);
    dirty.markClean();
    const first = root.querySelector('[data-item]');
    if (first) focusItem(first);
  } catch (error) {
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
      toOpml: () => toOpml(root, { title: document.title || 'Outline' }),
      parseOpml,
      loadOutline: (tree) => {
        loadOutline(root, tree);
        outlineHistory.discard();
        if (tree.title) applyDocumentTitle(tree.title);
        const item = root.querySelector('[data-item]');
        if (item) focusItem(item);
      },
      insertOutline: (tree) => {
        outlineHistory.run(() => {
          const after = api.getActiveItem?.() ?? null;
          return Boolean(insertOutline(root, tree, after));
        });
        syncRevert();
      },
      getTitle: () => document.title || 'Outline',
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
      markClean: () => dirty.markClean(),
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
        loadOutline(root, tree);
        if (got.title || tree.title) applyDocumentTitle(got.title || tree.title);
        if (got.fileId) currentOutlineId = got.fileId;
        currentRevision = got.revision ?? null;
        leaseToken = null;
        dirty.markClean();
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
        window.alert(
          'Could not open outline from Google Drive: ' + (error?.message || error),
        );
      },
    });
  }
}

void initCloud();
