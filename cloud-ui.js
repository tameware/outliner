/**
 * Toolbar/UI wiring for optional cloud auth and save/restore.
 */

import { syncCloudSaveMenuLabel } from './menubar.js';
import { outlineTitleFromFileName } from './local-file.js';

/**
 * @param {object} options
 * @param {boolean} options.configured
 * @param {boolean} [options.readOnlyView]
 * @param {boolean} [options.editShareMode] guest editing via ?edit= token (no Google sign-in)
 * @param {{ onAuthStateChanged: Function, signInWithGoogle: Function, signOut: Function }} options.auth
 * @param {ReturnType<import('./drive-cloud.js').createDriveCloudClient>} options.cloud
 * @param {object} options.outline
 */
export function mountCloudUi({
  configured,
  auth,
  cloud,
  outline,
  readOnlyView = false,
  editShareMode = false,
}) {
  const bar = document.querySelector('[data-cloud-bar]');
  const cloudMenu = document.querySelector('[data-menu="cloud"]');
  const btnAuth = document.getElementById('menu-cloud-auth');
  const userEl = document.getElementById('cloud-user');
  const btnSave = document.getElementById('menu-save');
  const btnSaveAs = document.getElementById('menu-save-as');
  const btnOpen = document.getElementById('menu-open');
  const btnInsert = document.getElementById('menu-insert');
  const btnDelete = document.getElementById('menu-delete');
  const btnShare = document.getElementById('menu-cloud-share');
  const btnShareEdit = document.getElementById('menu-cloud-share-edit');
  const saveDialog = document.getElementById('cloud-save-dialog');
  const saveForm = document.getElementById('cloud-save-form');
  const saveNameInput = document.getElementById('cloud-save-name');
  const btnSaveCancel = document.getElementById('btn-cloud-save-cancel');
  const openDialog = document.getElementById('cloud-open-dialog');
  const openDialogHeading = openDialog?.querySelector('h2');
  const listEl = document.getElementById('cloud-outline-list');
  const btnCancel = document.getElementById('btn-cloud-open-cancel');
  const deleteDialog = document.getElementById('cloud-delete-dialog');
  const deleteListEl = document.getElementById('cloud-delete-list');
  const btnDeleteCancel = document.getElementById('btn-cloud-delete-cancel');
  const statusEl = document.getElementById('cloud-status');

  /** @type {'save' | 'save-as'} */
  let saveDialogMode = 'save';
  /** @type {'open' | 'insert'} */
  let outlinePickerMode = 'open';
  /** @type {((ok: boolean) => void) | null} */
  let saveDialogWaiter = null;

  if (!bar) {
    return { destroy() {}, async saveCurrent() { return false; } };
  }

  if (!configured) {
    bar.hidden = true;
    if (cloudMenu) cloudMenu.hidden = true;
    return { destroy() {}, async saveCurrent() { return false; } };
  }

  bar.hidden = false;
  let user = null;
  let busy = false;

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message || '';
  }

  function syncSaveLabel() {
    syncCloudSaveMenuLabel(btnSave, outline.getOutlineId?.());
  }

  function syncAuthUi() {
    const signedIn = Boolean(user);
    const hideOwnerChrome = readOnlyView || editShareMode;
    // Keep Cloud visible in edit-share so Save remains reachable; hide fully only for read-only.
    if (cloudMenu) cloudMenu.hidden = readOnlyView;
    if (btnAuth) {
      btnAuth.hidden = hideOwnerChrome;
      btnAuth.disabled = busy;
      btnAuth.textContent = signedIn ? 'Sign out' : 'Sign in with Google';
    }
    if (userEl) {
      userEl.hidden = !signedIn || hideOwnerChrome;
      userEl.textContent = signedIn
        ? user.displayName || user.email || user.uid || 'Signed in'
        : '';
    }
    const canMutate =
      !busy && !readOnlyView && (editShareMode || signedIn);
    if (btnSave) {
      btnSave.hidden = readOnlyView;
      btnSave.disabled = !canMutate;
      syncSaveLabel();
    }
    if (btnSaveAs) {
      btnSaveAs.hidden = hideOwnerChrome;
      btnSaveAs.disabled = !canMutate || editShareMode;
    }
    if (btnOpen) {
      btnOpen.hidden = hideOwnerChrome;
      btnOpen.disabled = !canMutate || editShareMode;
    }
    if (btnInsert) {
      btnInsert.hidden = hideOwnerChrome;
      btnInsert.disabled = !canMutate || editShareMode;
    }
    if (btnDelete) {
      btnDelete.hidden = hideOwnerChrome;
      btnDelete.disabled = !canMutate || editShareMode;
    }
    if (btnShare) {
      btnShare.hidden = hideOwnerChrome;
      btnShare.disabled = !canMutate || editShareMode;
    }
    if (btnShareEdit) {
      btnShareEdit.hidden = hideOwnerChrome;
      btnShareEdit.disabled = !canMutate || editShareMode;
    }
  }

  async function withBusy(label, fn) {
    busy = true;
    syncAuthUi();
    setStatus(label);
    try {
      await fn();
      setStatus('');
      return true;
    } catch (error) {
      const message = error?.message || String(error);
      setStatus(message);
      window.alert(message);
      return false;
    } finally {
      busy = false;
      syncAuthUi();
    }
  }

  const unsub = auth.onAuthStateChanged((next) => {
    user = next;
    syncAuthUi();
  });

  async function onSignIn() {
    await withBusy('Signing in…', () => auth.signInWithGoogle());
  }

  async function onSignOut() {
    await withBusy('Signing out…', () => auth.signOut());
  }

  function closeDialog(el) {
    if (el?.close) el.close();
    else if (el) el.removeAttribute('open');
  }

  function openDialogEl(el) {
    if (el?.showModal) el.showModal();
    else if (el) el.setAttribute('open', '');
  }

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

  async function onSave() {
    const id = outline.getOutlineId?.();
    if (id) {
      return saveWithName(outline.getTitle?.() || 'Untitled', { forceNew: false });
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
    if (!user && !editShareMode) {
      window.alert('Sign in with Google to save to Google Drive.');
      return false;
    }
    return onSave();
  }

  async function saveWithName(title, { forceNew = false } = {}) {
    const name = String(title || '').trim() || 'Untitled';
    const ok = await withBusy('Saving to Google Drive…', async () => {
      const previousTitle = String(outline.getTitle?.() || '').trim();
      let id = outline.getOutlineId?.();
      // Edit-link guests always overwrite; renaming must not mint a new owner outline.
      const saveAsNew =
        !editShareMode &&
        (forceNew || (Boolean(id) && name !== previousTitle));

      outline.setTitle?.(name);
      const savedAt = new Date();
      outline.setUpdatedAt?.(savedAt);
      const opml = outline.toOpml();

      if (!id || saveAsNew) {
        if (id && saveAsNew) {
          outline.setOutlineId?.(null);
          outline.setRevision?.(null);
          outline.setLeaseToken?.(null);
        }
        const created = await cloud.createOutline({ title: name, opml });
        id = created.id;
        // Drive v3 often omits ETag; revision is optional (last-write-wins).
        const revision = created.revision ?? null;
        outline.setOutlineId?.(id);
        outline.setRevision?.(revision);
        outline.setLeaseToken?.(null);
        if (outline.syncUrl) outline.syncUrl(id);
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
      outline.setRevision?.(saved?.revision ?? revision);
      syncSaveLabel();
      setStatus(`Saved “${name}”`);
    });
    if (ok) outline.markClean?.();
    return ok;
  }

  function sortedOutlines(outlines) {
    return [...outlines].sort((a, b) =>
      String(a.title || a.id).localeCompare(String(b.title || b.id), undefined, {
        sensitivity: 'base',
      }),
    );
  }

  /**
   * @param {HTMLElement | null} list
   * @param {Array<{ id: string, title?: string }>} outlines
   * @param {(item: { id: string, title?: string }) => void} onPick
   * @param {string} emptyMessage
   */
  function fillOutlinePicker(list, outlines, onPick, emptyMessage) {
    if (!list) return;
    list.replaceChildren();
    const sorted = sortedOutlines(outlines);
    if (!sorted.length) {
      const empty = document.createElement('li');
      empty.textContent = emptyMessage;
      list.appendChild(empty);
      return;
    }
    for (const item of sorted) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.title || item.id;
      btn.addEventListener('click', () => onPick(item));
      li.appendChild(btn);
      list.appendChild(li);
    }
  }

  /**
   * @param {'open' | 'insert'} mode
   */
  async function showOutlinePicker(mode) {
    outlinePickerMode = mode;
    if (openDialogHeading) {
      openDialogHeading.textContent =
        mode === 'insert' ? 'Insert from Google Drive' : 'Open from Google Drive';
    }
    await withBusy('Loading list…', async () => {
      const outlines = await cloud.listOutlines();
      fillOutlinePicker(
        listEl,
        outlines,
        (item) => {
          if (outlinePickerMode === 'insert') {
            void insertOutlineFromCloud(item.id, item.title);
          } else {
            void openOutline(item.id, item.title);
          }
        },
        'No outlines yet. Save to Google Drive to create one.',
      );
      openDialogEl(openDialog);
    });
  }

  async function onOpen() {
    await showOutlinePicker('open');
  }

  async function onInsert() {
    await showOutlinePicker('insert');
  }

  async function onDeleteMenu() {
    await withBusy('Loading list…', async () => {
      const outlines = await cloud.listOutlines();
      fillOutlinePicker(
        deleteListEl,
        outlines,
        (item) => {
          void deleteOutline(item.id, item.title);
        },
        'No outlines to delete.',
      );
      openDialogEl(deleteDialog);
    });
  }

  async function deleteOutline(id, listedTitle) {
    const label = listedTitle || id;
    const okConfirm = window.confirm(
      `Delete “${label}”? It will move to Google Drive trash.`,
    );
    if (!okConfirm) return;
    const ok = await withBusy('Deleting…', async () => {
      await cloud.deleteOutline(id);
      if (outline.getOutlineId?.() === id) {
        outline.setOutlineId?.(null);
        outline.setRevision?.(null);
        outline.setLeaseToken?.(null);
        if (outline.syncUrl) outline.syncUrl(null);
        syncSaveLabel();
      }
      closeDialog(deleteDialog);
    });
    if (ok) setStatus(`Deleted “${label}”`);
  }

  async function openOutline(id, listedTitle) {
    if (outline.beforeReplace) {
      const allow = await outline.beforeReplace();
      if (!allow) return;
    }
    outline.beginLoading?.();
    closeDialog(openDialog);
    const ok = await withBusy('Opening…', async () => {
      const got = await cloud.getOutline(id);
      const opml = typeof got === 'string' ? got : got.opml;
      const revision = typeof got === 'string' ? null : got.revision;
      const driveTitle =
        typeof got === 'string' ? null : got.title;
      const tree = outline.parseOpml(opml);
      const modifiedTime =
        typeof got === 'string' ? null : got.modifiedTime || tree.dateModified;
      outline.setUpdatedAt?.(modifiedTime ?? null);
      outline.loadOutline(tree);
      outline.setOutlineId?.(id);
      outline.setRevision?.(revision ?? tree.revision ?? null);
      outline.setLeaseToken?.(null);
      const title = outlineTitleFromFileName(listedTitle || driveTitle, tree.title);
      outline.setTitle?.(title);
      if (outline.syncUrl) outline.syncUrl(id);
      syncSaveLabel();
      outline.markClean?.();
      setStatus(title ? `Opened “${title}”` : `Opened ${id}`);
    });
    if (!ok) outline.hideLoading?.();
  }

  /**
   * Insert a Drive outline below the caret without replacing the current document.
   * @param {string} id
   * @param {string | undefined} listedTitle
   */
  async function insertOutlineFromCloud(id, listedTitle) {
    if (typeof outline.insertOutline !== 'function') return;
    let title = listedTitle;
    const ok = await withBusy('Inserting…', async () => {
      const got = await cloud.getOutline(id);
      const opml = typeof got === 'string' ? got : got.opml;
      const tree = outline.parseOpml(opml);
      title = listedTitle || tree.title;
      outline.insertOutline(tree);
      closeDialog(openDialog);
    });
    if (ok) setStatus(title ? `Inserted “${title}”` : `Inserted ${id}`);
  }

  function absoluteShareUrl(urlPath) {
    try {
      return new URL(urlPath, window.location.origin).href;
    } catch {
      return urlPath;
    }
  }

  async function copyShareLink(result, copiedLabel) {
    const href = absoluteShareUrl(result.urlPath);
    try {
      await navigator.clipboard.writeText(href);
      setStatus(copiedLabel);
    } catch {
      window.prompt('Copy this link:', href);
      setStatus(copiedLabel.replace(/copied$/i, 'ready'));
    }
  }

  function requireSavedOutline(kind) {
    const id = outline.getOutlineId?.();
    if (!id || outline.isDirty?.()) {
      window.alert(
        kind === 'edit'
          ? 'Save this outline to Google Drive before creating an editable link.'
          : 'Save this outline to Google Drive before creating a read-only link.',
      );
      return null;
    }
    return id;
  }

  async function onShare() {
    const id = requireSavedOutline('view');
    if (!id) return;
    /** @type {{ urlPath: string } | undefined} */
    let result;
    const ok = await withBusy('Creating link…', async () => {
      result = await cloud.createShareLink(id);
    });
    if (ok && result) await copyShareLink(result, 'Read-only link copied');
  }

  async function onShareEdit() {
    const id = requireSavedOutline('edit');
    if (!id) return;
    /** @type {{ urlPath: string } | undefined} */
    let result;
    const ok = await withBusy('Creating link…', async () => {
      result = await cloud.createEditShareLink(id);
    });
    if (ok && result) await copyShareLink(result, 'Editable link copied');
  }

  function onCancelOpen() {
    closeDialog(openDialog);
  }

  function onCancelDelete() {
    closeDialog(deleteDialog);
  }

  function onCancelSave() {
    closeDialog(saveDialog);
    resolveSaveDialog(false);
  }

  btnAuth?.addEventListener('click', () => {
    if (user) void onSignOut();
    else void onSignIn();
  });
  btnSave?.addEventListener('click', () => {
    void onSave();
  });
  btnSaveAs?.addEventListener('click', () => {
    void onSaveAs();
  });
  btnOpen?.addEventListener('click', () => {
    void onOpen();
  });
  btnInsert?.addEventListener('click', () => {
    void onInsert();
  });
  btnDelete?.addEventListener('click', () => {
    void onDeleteMenu();
  });
  btnShare?.addEventListener('click', () => {
    void onShare();
  });
  btnShareEdit?.addEventListener('click', () => {
    void onShareEdit();
  });
  btnCancel?.addEventListener('click', onCancelOpen);
  btnDeleteCancel?.addEventListener('click', onCancelDelete);
  btnSaveCancel?.addEventListener('click', onCancelSave);
  saveForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = saveNameInput?.value?.trim();
    if (!name) {
      saveNameInput?.focus?.();
      return;
    }
    closeDialog(saveDialog);
    void saveWithName(name, { forceNew: saveDialogMode === 'save-as' }).then((ok) => {
      resolveSaveDialog(ok);
    });
  });

  if (readOnlyView) {
    setStatus('Read-only view');
  } else if (editShareMode) {
    setStatus('Editing via shared link');
  }

  syncAuthUi();

  return {
    destroy() {
      if (typeof unsub === 'function') unsub();
    },
    syncSaveLabel,
    saveCurrent,
  };
}
