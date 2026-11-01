/**
 * Cloud Save / Save As dialog and Drive write path.
 */

import { hasCloudSaveName } from '../chrome/menubar.js';
import { shouldSaveUnderNewName } from '../chrome/document-title.js';
import { closeDialog, openDialogEl } from './cloud-ui-dom.js';

/**
 * @param {{
 *   outline: object,
 *   cloud: object,
 *   editShareMode: boolean,
 *   readOnlyView: boolean,
 *   getUser: () => object | null,
 *   withBusy: (label: string, fn: () => Promise<void>) => Promise<boolean>,
 *   setStatus: (message: string) => void,
 *   syncSaveLabel: () => void,
 *   rememberDriveFileId: (id: string | null) => void,
 *   saveDialog?: HTMLElement | null,
 *   saveNameInput?: HTMLInputElement | null,
 * }} deps
 */
export function createCloudSaveController(deps) {
  const {
    outline,
    cloud,
    editShareMode,
    readOnlyView,
    getUser,
    withBusy,
    setStatus,
    syncSaveLabel,
    rememberDriveFileId,
    saveDialog = null,
    saveNameInput = null,
  } = deps;

  /** @type {'save' | 'save-as'} */
  let saveDialogMode = 'save';
  /** @type {((ok: boolean) => void) | null} */
  let saveDialogWaiter = null;

  function resolveSaveDialog(ok) {
    const resolve = saveDialogWaiter;
    saveDialogWaiter = null;
    resolve?.(ok);
  }

  function openSaveDialog(mode) {
    saveDialogMode = mode;
    if (saveNameInput) {
      saveNameInput.value = outline.getTitle?.() || 'Untitled';
    }
    const heading = saveDialog?.querySelector('h2');
    if (heading) {
      heading.textContent = mode === 'save-as' ? 'Save As' : 'Save to Google Drive';
    }
    openDialogEl(saveDialog);
    saveNameInput?.focus?.();
    saveNameInput?.select?.();
    return new Promise((resolve) => {
      saveDialogWaiter = resolve;
    });
  }

  async function saveWithName(title, { forceNew = false } = {}) {
    outline.flushTitle?.();
    // Caller name (Save As dialog) wins; onSave passes the flushed chrome title.
    const name =
      String(title || outline.getTitle?.() || '').trim() || 'Untitled';
    const ok = await withBusy('Saving to Google Drive…', async () => {
      let id = outline.getOutlineId?.();
      // Edit-link guests always overwrite; owner rename acts like Save As.
      const saveAsNew = shouldSaveUnderNewName({
        currentTitle: name,
        boundTitle: outline.getBoundTitle?.(),
        hasBinding: Boolean(id),
        forceNew,
        allowSaveAsNew: !editShareMode,
      });

      // Keep UI title/Updated unchanged until Drive accepts the write.
      const savedAt = new Date();
      const opml = outline.toOpml({ title: name, dateModified: savedAt });

      if (!id || saveAsNew) {
        const created = await cloud.createOutline({ title: name, opml });
        id = created.id;
        // Drive v3 often omits ETag; revision is optional (last-write-wins).
        const revision = created.revision ?? null;
        rememberDriveFileId(id);
        outline.commitCloudSave({
          id,
          revision,
          title: name,
          updatedAt: savedAt,
        });
        syncSaveLabel();
        setStatus(`Saved “${name}”`);
        return;
      }

      let revision = outline.getRevision?.();

      // Best-effort refresh when missing; never block save — Drive has no reliable etag.
      if (revision == null && cloud.getOutline) {
        try {
          const got = await cloud.getOutline(id);
          revision = typeof got === 'string' ? null : got.revision;
          outline.setRevision?.(revision);
        } catch {
          /* save without If-Match */
        }
      }

      let leaseToken = null;
      try {
        if (cloud.acquireLock) {
          const lease = await cloud.acquireLock(id);
          leaseToken = lease.token;
          outline.setLeaseToken?.(leaseToken);
        }

        const saved = await cloud.saveOutline(id, {
          opml,
          revision,
          leaseToken,
          title: name,
        });
        rememberDriveFileId(id);
        outline.commitCloudSave({
          id,
          revision: saved?.revision ?? revision,
          title: name,
          updatedAt: savedAt,
        });
        syncSaveLabel();
        setStatus(`Saved “${name}”`);
      } finally {
        if (leaseToken && cloud.releaseLock) {
          try {
            await cloud.releaseLock(id, leaseToken);
          } catch {
            /* best-effort unlock — lease TTL is the backstop */
          }
          outline.setLeaseToken?.(null);
        }
      }
    });
    if (ok) outline.markClean?.();
    return ok;
  }

  async function onSave() {
    outline.flushTitle?.();
    const id = outline.getOutlineId?.();
    const title = outline.getTitle?.() || 'Untitled';
    if (id) {
      return saveWithName(title, { forceNew: false });
    }
    // File → Open (and other named docs) already have a title — skip the dialog.
    if (hasCloudSaveName(title)) {
      return saveWithName(title, { forceNew: false });
    }
    return openSaveDialog('save');
  }

  function onSaveAs() {
    return openSaveDialog('save-as');
  }

  /**
   * Save the current outline (prompt for name when needed).
   * @returns {Promise<boolean>}
   */
  async function saveCurrent() {
    if (readOnlyView) return false;
    if (!getUser() && !editShareMode) {
      window.alert('Sign in with Google to save to Google Drive.');
      return false;
    }
    return onSave();
  }

  function onCancelSave() {
    closeDialog(saveDialog);
    resolveSaveDialog(false);
  }

  /**
   * @param {string} name
   */
  async function submitSaveDialog(name) {
    closeDialog(saveDialog);
    const ok = await saveWithName(name, {
      forceNew: saveDialogMode === 'save-as',
    });
    resolveSaveDialog(ok);
    return ok;
  }

  return {
    onSave,
    onSaveAs,
    saveCurrent,
    saveWithName,
    openSaveDialog,
    resolveSaveDialog,
    onCancelSave,
    submitSaveDialog,
    getSaveDialogMode: () => saveDialogMode,
  };
}
