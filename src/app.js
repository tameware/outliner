import {
  boot,
  promoteChildren,
  demoteFollowingSiblings,
  moveItemUp,
  moveItemDown,
  toggleItem,
  focusItem,
  downloadOpml,
  loadOutline,
  insertOutline,
  toOpml,
  parseOpml,
  setReadOnly,
  clearOutline,
  applyOpenExpansion,
} from './outliner/outliner.js';
import { DEFAULT_OUTLINE_OPML } from './outliner/default-outline.js';
import {
  outlineIdFromLocation,
  locationWithOutlineId,
  isReadOnlyViewFromLocation,
  isEditableShareFromLocation,
  viewTokenFromLocation,
  editTokenFromLocation,
} from './cloud/cloud.js';
import { bootCloud } from './cloud/boot.js';
import { applyReadOnlyToolbar } from './chrome/readonly-toolbar.js';
import { createOutlineHistory } from './outliner/clear-outline-ui.js';
import { handlePromoteDemoteShortcut } from './outliner/promote-demote-keys.js';
import {
  handleMoveUpDownShortcut,
  isForeignMoveShortcutTarget,
} from './outliner/move-up-down-keys.js';
import { systemBeep } from './chrome/system-beep.js';
import { mountIndentOutdentMenu } from './outliner/indent-outdent-menu.js';
import { mountMoveUpDownMenu } from './outliner/move-up-down-menu.js';
import { mountFindReplace } from './outliner/find-replace-ui.js';
import { blankOutlineForDeepLink } from './share/deep-link-boot.js';
import {
  bindDeepLinkOutlineLoad,
  isSoftDeepLinkLoadError,
} from './share/deep-link-load.js';
import {
  showOutlineLoading,
  hideOutlineLoading,
  isOutlineLoading,
} from './outliner/outline-loading.js';
import { clearCloudOutlineBinding } from './cloud/cloud-binding.js';
import { mountMenubar } from './chrome/menubar.js';
import { mountOutlinerMenu } from './chrome/outliner-menu.js';
import { applyMenuShortcuts } from './chrome/menu-shortcuts.js';
import {
  mountDocumentTitleEditor,
  flushDocumentTitleEditor,
} from './chrome/document-title.js';
import { createDocumentSession } from './chrome/document-session.js';
import { createLocalSession } from './file/local-session.js';
import {
  focusOutlineItem,
  unfocusOutline,
  isOutlineFocusActive,
  syncOutlineFocus,
} from './outliner/outline-focus.js';
import { createDirtyTracker } from './outliner/dirty-tracker.js';
import {
  offerSaveIfDirty,
  mountUnsavedChangesDialog,
  bindBeforeUnloadGuard,
} from './chrome/unsaved-changes.js';
import {
  revertToCleanSnapshot,
  syncRevertMenuItem,
} from './outliner/revert-outline.js';
import { outlineTitleFromFileName } from './file/local-file.js';

const rootEl = document.querySelector('[data-outline-root]');
const menubar = document.querySelector('.menubar');
const documentTitleEl = document.getElementById('document-title');
const documentUpdatedEl = document.getElementById('document-updated');

/** @type {ReturnType<typeof createDirtyTracker>} */
let dirty;
/** @type {HTMLElement} */
let root;

const docSession = createDocumentSession({
  titleEl: documentTitleEl,
  updatedEl: documentUpdatedEl,
  isDirty: () => dirty.isDirty(),
  isLoading: () => isOutlineLoading(root),
});
const {
  outlineTitleBase,
  rememberBoundTitle,
  syncDocumentTitles,
  applyDocumentTitle,
  applyDocumentUpdated,
  getUpdatedAt,
  getBoundTitle,
} = docSession;

mountMenubar(menubar);
/** Filled after boot so About/Version can return focus to the outline. */
let restoreOutlineFocus = () => {
  const item = rootEl.querySelector('[data-item]');
  if (item) focusItem(item);
};
const outlinerMenuUi = mountOutlinerMenu(document, {
  outlineRoot: rootEl,
  restoreOutlineFocus: () => restoreOutlineFocus(),
});
applyMenuShortcuts(document);
applyDocumentUpdated(null);

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
    // Clear / undo / redo / structural edits can enter or leave the starter outline.
    outlinerMenuUi.syncHelpEnabled();
    // Promote/demote/delete/move can leave Focus roles stale or blank.
    syncOutlineFocus(rootEl);
    const unfocus = document.getElementById('menu-unfocus');
    if (unfocus) unfocus.disabled = !isOutlineFocusActive(rootEl);
  },
});

const api = boot('[data-outline-root]', {
  runStructural: (mutate) => outlineHistory.run(mutate),
});
window.__outlinerApi = api;
root = api.root;
outlineHistory.bindShortcuts(root);
restoreOutlineFocus = () => {
  const item = api.getActiveItem?.();
  if (item) focusItem(item);
};

let currentOutlineId = outlineIdFromLocation(window.location);
let currentRevision = null;
let leaseToken = null;
const viewShareToken = viewTokenFromLocation(window.location);
const editShareToken = editTokenFromLocation(window.location);
const readOnlyShare = isReadOnlyViewFromLocation(window.location);
const editShareMode = isEditableShareFromLocation(window.location);
/** @type {{ saveCurrent: () => Promise<boolean> } | null} */
let cloudUi = null;
/** @type {{ invalidate?: () => void } | null} */
let deepLinkLoad = null;
let cloudSaveAvailable = false;

dirty = createDirtyTracker({
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
  loadOutline(root, parseOpml(DEFAULT_OUTLINE_OPML));
  applyOpenExpansion(root);
  outlineHistory.discard();
}
dirty.markClean();
rememberBoundTitle();
syncDocumentTitles();
mountDocumentTitleEditor(documentTitleEl, {
  onCommit: (title) => {
    applyDocumentTitle(title);
    syncRevert();
  },
  onChange: (title) => {
    applyDocumentTitle(title);
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

const localSession = createLocalSession({
  root,
  documentTitleEl,
  fileInput: document.getElementById('file-open'),
  fileSaveButton: document.getElementById('menu-file-save'),
  dirty,
  docSession,
  toOpml,
  parseOpml,
  loadOutline,
  downloadOpml,
  beforeReplace,
  syncRevert,
  syncFocusMenus,
  syncHelpEnabled: () => outlinerMenuUi.syncHelpEnabled(),
  onReplaceDocument: () => {
    deepLinkLoad?.invalidate?.();
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
  },
  getActiveItem: () => api.getActiveItem?.(),
  runStructural: (mutate) => outlineHistory.run(mutate),
  insertOutline,
  outlineHistoryDiscard: () => outlineHistory.discard(),
});
const { clearLocalFileHandle, saveLocalOutline } = localSession;

localSession.bindFileMenus({
  openButton: document.getElementById('menu-file-open'),
  saveButton: document.getElementById('menu-file-save'),
  saveAsButton: document.getElementById('menu-file-save-as'),
  insertButton: document.getElementById('menu-insert-import'),
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
  cloudUi?.syncSaveState?.();
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

function reclaimOutlineFocusIfIdle() {
  const active = document.activeElement;
  if (active && root.contains(active)) return;
  if (active?.closest?.('dialog[open]')) return;
  if (isForeignMoveShortcutTarget(active)) return;
  restoreOutlineFocus();
}
reclaimOutlineFocusIfIdle();
// Refresh / bfcache restore often leaves focus on chrome or a leftover dialog
// control; reclaim so ⌘← / ⌘→ hit the outline. (Avoid window `focus` — that
// steals clicks on the document title when returning to the tab.)
requestAnimationFrame(reclaimOutlineFocusIfIdle);
window.addEventListener('pageshow', reclaimOutlineFocusIfIdle);

void (async () => {
  const deepLinkKey = editShareToken || viewShareToken || currentOutlineId;
  const booted = await bootCloud({
    editShareToken,
    viewShareToken,
    readOnlyShare,
    editShareMode,
    onSynced: () => syncRevert(),
    applyReadOnly: () => {
      setReadOnly(root, true);
      applyReadOnlyToolbar(document.querySelector('.menubar'));
    },
    outlineFacade: {
      root,
      toOpml: (opts = {}) =>
        toOpml(root, {
          title: opts.title ?? outlineTitleBase(),
          dateModified: opts.dateModified ?? getUpdatedAt() ?? new Date(),
        }),
      parseOpml,
      beginLoading: () => {
        deepLinkLoad?.invalidate?.();
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
        // Prefer OPML date when present; callers (Cloud Open) set Drive time afterward.
        // Do not fall back to documentUpdatedAt — that can keep a previous file's stamp.
        applyDocumentUpdated(tree.dateModified ?? null);
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
      flushTitle: () => flushDocumentTitleEditor(documentTitleEl),
      setTitle: (title) => {
        applyDocumentTitle(title);
      },
      getBoundTitle,
      setBoundTitle: (title) => {
        rememberBoundTitle(title);
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
        rememberBoundTitle();
        syncDocumentTitles();
        cloudUi?.syncSaveState?.();
      },
    },
    bindDeepLink: deepLinkKey
      ? ({ auth, cloud }) =>
          // Eager load (public anyone-with-link or existing token). Also retry when
          // auth later delivers a signed-in user — do not depend only on a change event.
          // Eager load runs in the background; applyOutline/onError handle completion.
          // `ready` is for tests — do not await here or Cloud UI boot waits on Drive.
          bindDeepLinkOutlineLoad({
            auth,
            cloud,
            getOutlineId: () =>
              editShareToken || viewShareToken || currentOutlineId,
            applyOutline: async (got, requestedId) => {
              // Cloud Open may have moved on while this deep-link fetch was in flight.
              if (
                !editShareToken &&
                !viewShareToken &&
                requestedId &&
                currentOutlineId &&
                currentOutlineId !== requestedId
              ) {
                return;
              }
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
              if (got.fileId) {
                if (
                  editShareToken ||
                  viewShareToken ||
                  !currentOutlineId ||
                  currentOutlineId === requestedId ||
                  currentOutlineId === got.fileId
                ) {
                  syncUrl(got.fileId);
                }
              }
              currentRevision = got.revision ?? null;
              leaseToken = null;
              dirty.markClean();
              rememberBoundTitle();
              syncDocumentTitles();
              syncFocusMenus();
              cloudUi?.syncSaveState?.();
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
                'Could not open outline from Google Drive: ' +
                  (error?.message || error),
              );
            },
          })
      : null,
  });
  cloudSaveAvailable = booted.cloudSaveAvailable;
  cloudUi = booted.cloudUi;
  deepLinkLoad = booted.deepLinkLoad;
})();
