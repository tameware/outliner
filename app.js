import {
  boot,
  promoteChildren,
  demoteFollowingSiblings,
  toggleItem,
  focusItem,
  downloadOpml,
  readOpmlFile,
  loadOutline,
  toOpml,
  parseOpml,
  setReadOnly,
  clearOutline,
} from './outliner.js';
import {
  isCloudConfigured,
  createCloudClient,
  loadCloudConfig,
  outlineIdFromLocation,
  locationWithOutlineId,
  viewTokenFromLocation,
  editTokenFromLocation,
} from './cloud.js';
import { mountCloudUi } from './cloud-ui.js';
import { createFirebaseAuth, createNullAuth } from './auth-firebase.js';
import { applyReadOnlyToolbar } from './readonly-toolbar.js';
import { createOutlineHistory } from './clear-outline-ui.js';
import { matchPromoteDemoteShortcut } from './promote-demote-keys.js';
import { mountIndentOutdentMenu } from './indent-outdent-menu.js';
import { blankOutlineForDeepLink } from './deep-link-boot.js';
import { mountMenubar } from './menubar.js';
import { applyMenuShortcuts } from './menu-shortcuts.js';
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
mountMenubar(menubar);
applyMenuShortcuts(document);

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
const viewToken = viewTokenFromLocation(window.location);
const editToken = editTokenFromLocation(window.location);
/** @type {{ saveCurrent: () => Promise<boolean> } | null} */
let cloudUi = null;
let cloudSaveAvailable = false;

/**
 * When opened via ?edit=, map owner cloud methods onto edit-token endpoints.
 * @param {ReturnType<typeof createCloudClient>} cloud
 * @param {string} token
 */
function cloudWithEditToken(cloud, token) {
  return {
    ...cloud,
    async getOutline() {
      const got = await cloud.getEditableOutline(token);
      return { opml: got.opml, revision: got.revision };
    },
    async saveOutline(_id, args) {
      return cloud.saveEditableOutline(token, args);
    },
    async acquireLock() {
      return cloud.acquireEditLock(token);
    },
    async releaseLock(_id, lease) {
      return cloud.releaseEditLock(token, lease);
    },
  };
}

const dirty = createDirtyTracker({
  getSnapshot: () => toOpml(root, { title: document.title || 'Outline' }),
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

document.getElementById('menu-promote').addEventListener('click', () => {
  if (root.dataset.readonly === 'true') return;
  runPromoteDemote('promote');
});
document.getElementById('menu-demote').addEventListener('click', () => {
  if (root.dataset.readonly === 'true') return;
  runPromoteDemote('demote');
});

document.addEventListener(
  'keydown',
  (event) => {
    if (root.dataset.readonly === 'true') return;
    const action = matchPromoteDemoteShortcut(event);
    if (!action) return;
    if (runPromoteDemote(action)) event.preventDefault();
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
  if (root.dataset.readonly === 'true') return;
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
      if (title) document.title = title;
    },
    run: (mutate) => outlineHistory.run(mutate),
  });
  if (ok) {
    const first = root.querySelector('[data-item]');
    if (first) focusItem(first);
  }
  syncRevert();
});

document.getElementById('menu-import').addEventListener('click', () => {
  if (root.dataset.readonly === 'true') return;
  void beforeReplace().then((allow) => {
    if (allow) fileInput.click();
  });
});

fileInput.addEventListener('change', async () => {
  if (root.dataset.readonly === 'true') return;
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  try {
    const tree = await readOpmlFile(file);
    loadOutline(root, tree);
    outlineHistory.discard();
    if (tree.title) document.title = tree.title;
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
    cloud = createCloudClient({
      apiBase: cloudConfig.apiBase,
      getIdToken: () => auth.getIdToken(),
    });
  }

  if (configured && cloudConfig.firebase && !viewToken && !editToken) {
    try {
      const [{ initializeApp }, authMod] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js'),
      ]);
      auth = await createFirebaseAuth(cloudConfig.firebase, {
        app: { initializeApp },
        auth: authMod,
      });
      cloud = createCloudClient({
        apiBase: cloudConfig.apiBase,
        getIdToken: () => auth.getIdToken(),
      });
    } catch (error) {
      console.error('Firebase Auth failed to initialize', error);
    }
  }

  if (configured && cloud && viewToken) {
    try {
      const got = await cloud.getSharedOutline(viewToken);
      const tree = parseOpml(got.opml);
      loadOutline(root, tree);
      setReadOnly(root, true);
      applyReadOnlyToolbar(document.querySelector('.menubar'));
      if (got.title) document.title = got.title;
      dirty.markClean();
    } catch (error) {
      console.warn('Could not load shared outline', error);
      window.alert('Could not open read-only link: ' + (error?.message || error));
    }
  }

  if (configured && cloud && editToken && !viewToken) {
    try {
      const got = await cloud.getEditableOutline(editToken);
      const tree = parseOpml(got.opml);
      loadOutline(root, tree);
      if (got.id) currentOutlineId = got.id;
      currentRevision = got.revision ?? null;
      leaseToken = null;
      if (got.title) document.title = got.title;
      dirty.markClean();
      const item = root.querySelector('[data-item]');
      if (item) focusItem(item);
    } catch (error) {
      console.warn('Could not load editable outline', error);
      window.alert('Could not open editable link: ' + (error?.message || error));
    }
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
    async getSharedOutline() { return { opml: '', title: null }; },
    async getEditableOutline() {
      return { opml: '', title: null, revision: null, id: null };
    },
    async saveEditableOutline() { return {}; },
    async acquireEditLock() { return { token: '' }; },
    async releaseEditLock() {},
  };

  let sessionCloud = cloud || nullCloud;
  if (cloud && editToken && !viewToken) {
    sessionCloud = cloudWithEditToken(cloud, editToken);
  }

  cloudSaveAvailable = configured;
  cloudUi = mountCloudUi({
    configured,
    readOnlyView: Boolean(viewToken),
    editShareMode: Boolean(editToken) && !viewToken,
    auth,
    cloud: sessionCloud,
    outline: {
      root,
      toOpml: () => toOpml(root, { title: document.title || 'Outline' }),
      parseOpml,
      loadOutline: (tree) => {
        loadOutline(root, tree);
        outlineHistory.discard();
        if (tree.title) document.title = tree.title;
        const item = root.querySelector('[data-item]');
        if (item) focusItem(item);
      },
      getTitle: () => document.title || 'Outline',
      setTitle: (title) => {
        if (title) document.title = title;
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
      syncUrl: editToken
        ? () => {
            /* keep ?edit= in the address bar */
          }
        : syncUrl,
      beforeReplace,
      markClean: () => dirty.markClean(),
    },
  });

  if (configured && cloud && currentOutlineId && !viewToken && !editToken) {
    auth.onAuthStateChanged(async (user) => {
      if (!user || !currentOutlineId) return;
      try {
        const got = await cloud.getOutline(currentOutlineId);
        const opml = typeof got === 'string' ? got : got.opml;
        const tree = parseOpml(opml);
        loadOutline(root, tree);
        if (tree.title) document.title = tree.title;
        currentRevision =
          typeof got === 'string' ? null : (got.revision ?? null);
        leaseToken = null;
        dirty.markClean();
        const item = root.querySelector('[data-item]');
        if (item) focusItem(item);
      } catch (error) {
        console.warn('Could not load outline from URL', error);
      }
    });
  }
}

void initCloud();
