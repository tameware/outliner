import { cloudOpenUpdatedAt } from './loaded-outline.js';
import { clearCloudOutlineBinding } from './cloud-binding.js';

/**
 * Typed document + Drive-binding session shared by Cloud UI (and app deep-link wiring).
 *
 * Owns outline id / revision / lease and exposes a façade with high-level
 * `commitCloudSave` / `applyCloudOpen` / `clearCloudBinding` so callers do not
 * juggle a kitchen-sink of optional setters.
 *
 * @param {{
 *   root: HTMLElement,
 *   initialOutlineId?: string | null,
 *   dirty: { isDirty: () => boolean, markClean: () => void },
 *   docSession: {
 *     outlineTitleBase: () => string,
 *     applyDocumentTitle: (title: string) => void,
 *     applyDocumentUpdated: (date: Date | string | number | null | undefined) => void,
 *     getUpdatedAt: () => Date | null,
 *     getBoundTitle: () => string,
 *     rememberBoundTitle: (title?: string) => void,
 *     syncDocumentTitles: () => void,
 *   },
 *   toOpml: Function,
 *   parseOpml: Function,
 *   loadOutline: Function,
 *   applyOpenExpansion: (root: HTMLElement) => void,
 *   insertOutline: Function,
 *   showOutlineLoading: Function,
 *   hideOutlineLoading: Function,
 *   outlineHistoryDiscard: () => void,
 *   syncFocusMenus: () => void,
 *   syncHelpEnabled: () => void,
 *   syncRevert: () => void,
 *   clearLocalFileHandle: () => void,
 *   flushTitle: () => void,
 *   focusFirstItem: () => void,
 *   getActiveItem: () => HTMLElement | null | undefined,
 *   runStructural: (mutate: () => boolean | void) => boolean | void,
 *   syncUrl: (id: string | null) => void,
 *   beforeReplace?: () => Promise<boolean>,
 *   onMarkClean?: () => void,
 *   invalidateDeepLink?: () => void,
 * }} deps
 */
export function createOutlineSession(deps) {
  const {
    root,
    dirty,
    docSession,
    toOpml: toOpmlFn,
    parseOpml: parseOpmlFn,
    loadOutline: loadOutlineFn,
    applyOpenExpansion,
    insertOutline: insertOutlineFn,
    showOutlineLoading,
    hideOutlineLoading,
    outlineHistoryDiscard,
    syncFocusMenus,
    syncHelpEnabled,
    syncRevert,
    clearLocalFileHandle,
    flushTitle,
    focusFirstItem,
    getActiveItem,
    runStructural,
    syncUrl,
    beforeReplace,
    onMarkClean,
    invalidateDeepLink,
  } = deps;

  /** @type {string | null} */
  let outlineId =
    deps.initialOutlineId && String(deps.initialOutlineId).trim()
      ? String(deps.initialOutlineId).trim()
      : null;
  /** @type {string | number | null} */
  let revision = null;
  /** @type {string | null} */
  let leaseToken = null;

  function getOutlineId() {
    return outlineId;
  }

  function setOutlineId(id) {
    outlineId = id && String(id).trim() ? String(id).trim() : null;
  }

  function getRevision() {
    return revision;
  }

  function setRevision(rev) {
    revision = rev ?? null;
  }

  function getLeaseToken() {
    return leaseToken;
  }

  function setLeaseToken(token) {
    leaseToken = token ?? null;
  }

  function clearCloudBinding() {
    clearCloudOutlineBinding({
      setOutlineId,
      setRevision,
      setLeaseToken,
      syncUrl,
    });
  }

  /**
   * @param {{
   *   id: string,
   *   revision?: string | number | null,
   *   title: string,
   *   updatedAt?: Date | string | number | null,
   * }} opts
   */
  function commitCloudSave({ id, revision: nextRev = null, title, updatedAt }) {
    setOutlineId(id);
    setRevision(nextRev);
    setLeaseToken(null);
    docSession.applyDocumentTitle(title);
    docSession.rememberBoundTitle(title);
    if (updatedAt != null) docSession.applyDocumentUpdated(updatedAt);
    syncUrl(id);
  }

  /**
   * @param {{
   *   tree: { title?: string, items?: unknown[], dateModified?: Date | null },
   *   driveId: string,
   *   revision?: string | number | null,
   *   title: string,
   *   modifiedTime?: Date | string | number | null,
   * }} opts
   */
  function applyCloudOpen({
    tree,
    driveId,
    revision: nextRev = null,
    title,
    modifiedTime = null,
  }) {
    hideOutlineLoading(root);
    clearLocalFileHandle();
    loadOutlineFn(tree);
    applyOpenExpansion(root);
    outlineHistoryDiscard();
    // Drive Last-Modified wins; fall back only when the caller omitted it.
    docSession.applyDocumentUpdated(modifiedTime ?? cloudOpenUpdatedAt(tree));
    setOutlineId(driveId);
    setRevision(nextRev);
    setLeaseToken(null);
    docSession.applyDocumentTitle(title);
    docSession.rememberBoundTitle(title);
    syncUrl(driveId);
    syncFocusMenus();
    syncHelpEnabled();
    focusFirstItem();
    dirty.markClean();
    onMarkClean?.();
  }

  function beginLoading() {
    invalidateDeepLink?.();
    showOutlineLoading(root, { loadOutline: loadOutlineFn });
    outlineHistoryDiscard();
    dirty.markClean();
    docSession.syncDocumentTitles();
  }

  function markClean() {
    dirty.markClean();
    docSession.rememberBoundTitle();
    docSession.syncDocumentTitles();
    onMarkClean?.();
  }

  const facade = {
    root,
    toOpml: (opts = {}) =>
      toOpmlFn(root, {
        title: opts.title ?? docSession.outlineTitleBase(),
        dateModified: opts.dateModified ?? docSession.getUpdatedAt() ?? new Date(),
      }),
    parseOpml: parseOpmlFn,
    beginLoading,
    hideLoading: () => hideOutlineLoading(root),
    /** @deprecated Prefer applyCloudOpen for Cloud Open. Kept for deep-link paint paths. */
    loadOutline: (tree) => {
      hideOutlineLoading(root);
      clearLocalFileHandle();
      loadOutlineFn(tree);
      applyOpenExpansion(root);
      outlineHistoryDiscard();
      docSession.applyDocumentUpdated(cloudOpenUpdatedAt(tree));
      syncFocusMenus();
      syncHelpEnabled();
      focusFirstItem();
    },
    setUpdatedAt: (date) => {
      docSession.applyDocumentUpdated(date);
    },
    getUpdatedAt: () => docSession.getUpdatedAt(),
    insertOutline: (tree) => {
      runStructural(() => {
        const after = getActiveItem() ?? null;
        return Boolean(insertOutlineFn(root, tree, after));
      });
      syncRevert();
    },
    getTitle: () => docSession.outlineTitleBase(),
    flushTitle,
    setTitle: (title) => {
      docSession.applyDocumentTitle(title);
    },
    getBoundTitle: () => docSession.getBoundTitle(),
    setBoundTitle: (title) => {
      docSession.rememberBoundTitle(title);
    },
    getOutlineId,
    setOutlineId,
    getRevision,
    setRevision,
    getLeaseToken,
    setLeaseToken,
    syncUrl,
    beforeReplace,
    isDirty: () => dirty.isDirty(),
    markClean,
    clearCloudBinding,
    commitCloudSave,
    applyCloudOpen,
  };

  return {
    facade,
    getOutlineId,
    setOutlineId,
    getRevision,
    setRevision,
    getLeaseToken,
    setLeaseToken,
  };
}
