import {
  boot,
  removeItem,
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
} from './cloud.js';
import { mountCloudUi } from './cloud-ui.js';
import { createFirebaseAuth, createNullAuth } from './auth-firebase.js';
import { applyReadOnlyToolbar } from './readonly-toolbar.js';
import { createOutlineHistory } from './clear-outline-ui.js';
import { matchPromoteDemoteShortcut } from './promote-demote-keys.js';
import { blankOutlineForDeepLink } from './deep-link-boot.js';

const rootEl = document.querySelector('[data-outline-root]');
const outlineHistory = createOutlineHistory({
  getRoot: () => rootEl,
  button: document.getElementById('btn-clear'),
  undoButton: document.getElementById('btn-undo'),
  redoButton: document.getElementById('btn-redo'),
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

// Avoid flashing the starter outline while ?id= / ?view= content loads.
if (blankOutlineForDeepLink(root, window.location, { loadOutline })) {
  outlineHistory.discard();
}

function syncUrl(id) {
  currentOutlineId = id;
  const next = locationWithOutlineId(window.location, id);
  window.history.replaceState(null, '', next);
}

function setToolbarEnabled(enabled) {
  document.querySelectorAll('.toolbar button').forEach((btn) => {
    btn.disabled = !enabled;
    if (enabled) btn.hidden = false;
  });
  const fileInput = document.getElementById('file-open');
  if (fileInput) fileInput.disabled = !enabled;
}

// Keep outline focus when using the toolbar.
document.querySelectorAll('.toolbar button, .cloud-bar button').forEach((btn) => {
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

document.getElementById('btn-undo').addEventListener('click', () => {
  if (root.dataset.readonly === 'true') return;
  outlineHistory.undo();
});
document.getElementById('btn-redo').addEventListener('click', () => {
  if (root.dataset.readonly === 'true') return;
  outlineHistory.redo();
});
document.getElementById('btn-remove').addEventListener('click', () => {
  if (root.dataset.readonly === 'true') return;
  const item = api.getActiveItem();
  if (item) removeItem(item);
});
document.getElementById('btn-promote').addEventListener('click', () => {
  if (root.dataset.readonly === 'true') return;
  runPromoteDemote('promote');
});
document.getElementById('btn-demote').addEventListener('click', () => {
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
document.getElementById('btn-expand-all').addEventListener('click', () => {
  root.querySelectorAll('[data-item][data-has-children="true"]').forEach((item) => {
    if (item.dataset.state === 'collapsed') toggleItem(item);
  });
});
document.getElementById('btn-collapse-all').addEventListener('click', () => {
  root.querySelectorAll('[data-item][data-has-children="true"]').forEach((item) => {
    if (item.dataset.state !== 'collapsed') toggleItem(item);
  });
});

document.getElementById('btn-clear').addEventListener('click', () => {
  if (root.dataset.readonly === 'true') return;
  outlineHistory.clear();
  const first = root.querySelector('[data-item]');
  if (first) focusItem(first);
});

const fileInput = document.getElementById('file-open');

document.getElementById('btn-save').addEventListener('click', () => {
  if (root.dataset.readonly === 'true') return;
  const title = document.title || 'Outline';
  downloadOpml(root, { title, filename: 'outline.opml' });
});

document.getElementById('btn-open').addEventListener('click', () => {
  if (root.dataset.readonly === 'true') return;
  fileInput.click();
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

  if (configured && cloudConfig.firebase && !viewToken) {
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
      applyReadOnlyToolbar(document.querySelector('.toolbar'));
      if (got.title) document.title = got.title;
    } catch (error) {
      console.warn('Could not load shared outline', error);
      window.alert('Could not open read-only link: ' + (error?.message || error));
    }
  }

  mountCloudUi({
    configured,
    readOnlyView: Boolean(viewToken),
    auth,
    cloud: cloud || {
      async listOutlines() { return []; },
      async getOutline() { return { opml: '', revision: null }; },
      async createOutline() { return { id: 'local' }; },
      async saveOutline() { return {}; },
      async acquireLock() { return { token: '' }; },
      async releaseLock() {},
      async createShareLink() { return { token: '', urlPath: '' }; },
      async getSharedOutline() { return { opml: '', title: null }; },
    },
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
      syncUrl,
    },
  });

  if (configured && cloud && currentOutlineId && !viewToken) {
    // Deep link: load when signed in
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
        const item = root.querySelector('[data-item]');
        if (item) focusItem(item);
      } catch (error) {
        console.warn('Could not load outline from URL', error);
      }
    });
  }
}

void initCloud();
