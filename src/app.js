import {
  boot,
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
import { createOutlineHistory } from './outliner/outline-history.js';
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
import {
  deepLinkDocumentTitle,
  shouldIgnoreStaleDeepLink,
  shouldSyncOwnerUrlAfterDeepLink,
} from './cloud/loaded-outline.js';
import { createOutlineSession } from './cloud/outline-session.js';
import { mountMenubar } from './chrome/menubar.js';
import { mountOutlinerMenu } from './chrome/outliner-menu.js';
import { applyMenuShortcuts } from './chrome/menu-shortcuts.js';
import {
  mountDocumentTitleEditor,
  flushDocumentTitleEditor,
  documentTitleLabel,
  stripDirtyTitleSuffix,
} from './chrome/document-title.js';
import { createDocumentSession } from './chrome/document-session.js';
import { bindOutlineChrome } from './chrome/outline-chrome.js';
import { createLocalSession } from './file/local-session.js';
import {
  isOutlineFocusActive,
  syncOutlineFocus,
} from './outliner/outline-focus.js';
import { createDirtyTracker } from './outliner/dirty-tracker.js';
import {
  offerSaveIfDirty,
  mountUnsavedChangesDialog,
  bindBeforeUnloadGuard,
} from './chrome/unsaved-changes.js';
import { outlineTitleFromFileName } from './file/local-file.js';

const rootEl = document.querySelector('[data-outline-root]');
const menubar = document.querySelector('.menubar');
const documentTitleEl = document.getElementById('document-title');
const documentUpdatedEl = document.getElementById('document-updated');

/** @type {HTMLElement} */
let root;
/** @type {() => void} */
let syncRevert = () => {};
/** @type {() => void} */
let syncFocusMenus = () => {};
/** @type {() => void} */
let clearLocalFileHandle = () => {};

/** Same title base docSession uses — available before that object exists. */
function outlineTitleForSnapshot() {
  return documentTitleLabel(stripDirtyTitleSuffix(document.title));
}

// Dirty tracker before docSession: isDirty() must be safe if titles sync early.
const dirty = createDirtyTracker({
  getContentSnapshot: () =>
    toOpml(rootEl, {
      title: outlineTitleForSnapshot(),
      includeExpansionState: false,
    }),
  getRevertSnapshot: () =>
    toOpml(rootEl, { title: outlineTitleForSnapshot() }),
});

const docSession = createDocumentSession({
  titleEl: documentTitleEl,
  updatedEl: documentUpdatedEl,
  isDirty: () => dirty.isDirty(),
  // rootEl is available immediately; `root` is only assigned after boot().
  isLoading: () => isOutlineLoading(rootEl),
});
const {
  outlineTitleBase,
  rememberBoundTitle,
  syncDocumentTitles,
  applyDocumentTitle,
  applyDocumentUpdated,
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

const viewShareToken = viewTokenFromLocation(window.location);
const editShareToken = editTokenFromLocation(window.location);
const readOnlyShare = isReadOnlyViewFromLocation(window.location);
const editShareMode = isEditableShareFromLocation(window.location);
/** @type {{ saveCurrent: () => Promise<boolean> } | null} */
let cloudUi = null;
/** @type {{ invalidate?: () => void } | null} */
let deepLinkLoad = null;
let cloudSaveAvailable = false;
/** @type {ReturnType<typeof createOutlineSession> | null} */
let outlineSession = null;

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
  const starter = parseOpml(DEFAULT_OUTLINE_OPML);
  loadOutline(root, starter);
  applyOpenExpansion(root);
  outlineHistory.discard();
  if (starter.title) applyDocumentTitle(starter.title);
}
dirty.markClean();
rememberBoundTitle();
syncDocumentTitles();

({ syncFocusMenus, syncRevert } = bindOutlineChrome({
  root,
  api,
  outlineHistory,
  dirty,
  applyDocumentTitle,
  applyDocumentUpdated,
  syncDocumentTitles,
  parseOpml,
  loadOutline,
  clearLocalFileHandle: () => clearLocalFileHandle(),
  restoreOutlineFocus: () => restoreOutlineFocus(),
  syncCloudSaveState: () => cloudUi?.syncSaveState?.(),
}));

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

/** History rewrite only — Drive id lives on outlineSession. */
function syncUrl(id) {
  // Owner bookmarks use ?id= only; keep opaque ?view= / ?edit= share URLs intact.
  if (viewShareToken || editShareToken) return;
  const next = locationWithOutlineId(window.location, id);
  window.history.replaceState(null, '', next);
}

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
    outlineSession?.facade.clearCloudBinding();
    cloudUi?.syncSaveLabel?.();
  },
  getActiveItem: () => api.getActiveItem?.(),
  runStructural: (mutate) => outlineHistory.run(mutate),
  insertOutline,
  outlineHistoryDiscard: () => outlineHistory.discard(),
});
const { saveLocalOutline } = localSession;
clearLocalFileHandle = localSession.clearLocalFileHandle;

localSession.bindFileMenus({
  openButton: document.getElementById('menu-file-open'),
  saveButton: document.getElementById('menu-file-save'),
  saveAsButton: document.getElementById('menu-file-save-as'),
  insertButton: document.getElementById('menu-insert-import'),
});

outlineSession = createOutlineSession({
  root,
  initialOutlineId: outlineIdFromLocation(window.location),
  dirty,
  docSession,
  toOpml,
  parseOpml,
  loadOutline,
  applyOpenExpansion,
  insertOutline,
  showOutlineLoading,
  hideOutlineLoading,
  outlineHistoryDiscard: () => outlineHistory.discard(),
  syncFocusMenus,
  syncHelpEnabled: () => outlinerMenuUi.syncHelpEnabled(),
  syncRevert,
  clearLocalFileHandle: () => clearLocalFileHandle(),
  flushTitle: () => flushDocumentTitleEditor(documentTitleEl),
  focusFirstItem: () => {
    const item = root.querySelector('[data-item]');
    if (item) focusItem(item);
  },
  getActiveItem: () => api.getActiveItem?.(),
  runStructural: (mutate) => outlineHistory.run(mutate),
  syncUrl,
  beforeReplace,
  onMarkClean: () => {
    cloudUi?.syncSaveState?.();
  },
  invalidateDeepLink: () => {
    deepLinkLoad?.invalidate?.();
  },
});

void (async () => {
  const deepLinkKey =
    editShareToken || viewShareToken || outlineSession.getOutlineId();
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
    outlineFacade: outlineSession.facade,
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
              editShareToken || viewShareToken || outlineSession.getOutlineId(),
            applyOutline: async (got, requestedId) => {
              const shareMode = Boolean(editShareToken || viewShareToken);
              const currentId = outlineSession.getOutlineId();
              if (
                shouldIgnoreStaleDeepLink({
                  shareMode,
                  requestedId,
                  currentOutlineId: currentId,
                })
              ) {
                return;
              }
              const tree = parseOpml(got.opml);
              const title =
                deepLinkDocumentTitle(got, tree, outlineTitleFromFileName) ||
                '';
              outlineSession.facade.loadOutline(tree);
              if (title) applyDocumentTitle(title);
              applyDocumentUpdated(
                got.modifiedTime ?? tree.dateModified ?? null,
              );
              // Match Cloud Open: keep outline id + owner ?id= URL in sync.
              // Share ?view= / ?edit= URLs stay opaque (syncUrl no-ops the rewrite).
              if (
                shouldSyncOwnerUrlAfterDeepLink({
                  shareMode,
                  fileId: got.fileId,
                  requestedId,
                  currentOutlineId: currentId,
                })
              ) {
                outlineSession.setOutlineId(got.fileId);
                syncUrl(got.fileId);
              }
              outlineSession.setRevision(got.revision ?? null);
              outlineSession.setLeaseToken(null);
              dirty.markClean();
              rememberBoundTitle();
              syncDocumentTitles();
              syncFocusMenus();
              cloudUi?.syncSaveState?.();
              if (readOnlyShare) {
                setReadOnly(root, true);
                applyReadOnlyToolbar(document.querySelector('.menubar'));
              }
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
