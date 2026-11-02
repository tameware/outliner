/**
 * Toolbar/UI wiring for optional cloud auth and save/restore.
 */

import { hasCloudSaveName, syncCloudSaveMenuLabel } from '../chrome/menubar.js';
import { createCloudSaveController } from './cloud-ui-save.js';
import { createCloudPickerController } from './cloud-ui-picker.js';
import { createCloudShareController } from './cloud-ui-share.js';
import { bindDialogDismissKeys } from './cloud-ui-dom.js';

/**
 * @param {object} options
 * @param {boolean} options.configured
 * @param {boolean} [options.readOnlyView]
 * @param {boolean} [options.editShareMode] guest editing via ?edit= token (no Google sign-in)
 * @param {{ onAuthStateChanged: Function, signInWithGoogle: Function, signOut: Function }} options.auth
 * @param {ReturnType<import('./drive-cloud.js').createDriveCloudClient>} options.cloud
 * @param {object} options.outline typed façade from createOutlineSession
 *   (commitCloudSave / applyCloudOpen / clearCloudBinding + title/binding getters)
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
  /**
   * Drive file id from the last successful Cloud Open / Save.
   * Share links use this so a stale getOutlineId() (e.g. late deep-link syncUrl)
   * cannot mint a link for a previously opened outline.
   * @type {string | null}
   */
  let activeDriveFileId = outline.getOutlineId?.() || null;

  /**
   * @param {string | null | undefined} id
   */
  function rememberDriveFileId(id) {
    const next = id && String(id).trim() ? String(id).trim() : null;
    activeDriveFileId = next;
  }

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message || '';
  }

  function syncSaveLabel() {
    syncCloudSaveMenuLabel(
      btnSave,
      outline.getOutlineId?.(),
      outline.getTitle?.(),
    );
  }

  function syncAuthUi() {
    const signedIn = Boolean(user);
    const hideOwnerChrome = readOnlyView || editShareMode;
    // Keep Cloud visible in edit-share so Save remains reachable; hide fully only for read-only.
    if (cloudMenu) cloudMenu.hidden = readOnlyView;
    if (btnAuth) {
      btnAuth.hidden = hideOwnerChrome;
      // Keep disabled under share links even if something un-hides the control.
      btnAuth.disabled = busy || hideOwnerChrome;
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
    const dirty = outline.isDirty ? outline.isDirty() : true;
    const id = outline.getOutlineId?.();
    // Clean + named + not yet on Drive (e.g. File → Open) still needs Cloud Save.
    const namedLocalUpload = !id && hasCloudSaveName(outline.getTitle?.());
    if (btnSave) {
      btnSave.hidden = readOnlyView;
      btnSave.disabled = !canMutate || (!dirty && !namedLocalUpload);
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
    // Editable/read-only share links are token sandboxes — no Google account.
    if (readOnlyView || editShareMode) return;
    await withBusy('Signing in…', () => auth.signInWithGoogle());
  }

  async function onSignOut() {
    if (readOnlyView || editShareMode) return;
    await withBusy('Signing out…', () => auth.signOut());
  }

  /** @type {Parameters<typeof createCloudSaveController>[0]} */
  const host = {
    outline,
    cloud,
    editShareMode,
    readOnlyView,
    getUser: () => user,
    withBusy,
    setStatus,
    syncSaveLabel,
    rememberDriveFileId,
  };

  const save = createCloudSaveController({
    ...host,
    saveDialog,
    saveNameInput,
  });

  const picker = createCloudPickerController({
    ...host,
    getActiveDriveFileId: () => activeDriveFileId,
    openDialog,
    openDialogHeading,
    listEl,
    deleteDialog,
    deleteListEl,
  });

  const share = createCloudShareController({
    ...host,
    getActiveDriveFileId: () => activeDriveFileId,
  });

  btnAuth?.addEventListener('click', () => {
    if (user) void onSignOut();
    else void onSignIn();
  });
  btnSave?.addEventListener('click', () => {
    void save.onSave();
  });
  btnSaveAs?.addEventListener('click', () => {
    void save.onSaveAs();
  });

  /** ⌘S / Ctrl+S → Cloud Save (overrides the browser’s Save Page). */
  function onSaveShortcut(event) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
      return;
    }
    const key = event.key?.toLowerCase?.() || '';
    if (key !== 's') return;
    event.preventDefault();
    if (btnSave?.disabled) return;
    void save.saveCurrent();
  }
  document.addEventListener('keydown', onSaveShortcut, true);
  btnOpen?.addEventListener('click', () => {
    void picker.onOpen();
  });
  btnInsert?.addEventListener('click', () => {
    void picker.onInsert();
  });
  btnDelete?.addEventListener('click', () => {
    void picker.onDeleteMenu();
  });
  btnShare?.addEventListener('click', () => {
    void share.onShare();
  });
  btnShareEdit?.addEventListener('click', () => {
    void share.onShareEdit();
  });
  btnCancel?.addEventListener('click', picker.onCancelOpen);
  btnDeleteCancel?.addEventListener('click', picker.onCancelDelete);
  btnSaveCancel?.addEventListener('click', save.onCancelSave);
  bindDialogDismissKeys(saveDialog, { onDismiss: save.onCancelSave });
  bindDialogDismissKeys(openDialog, { onDismiss: picker.onCancelOpen });
  bindDialogDismissKeys(deleteDialog, { onDismiss: picker.onCancelDelete });
  saveForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = saveNameInput?.value?.trim();
    if (!name) {
      saveNameInput?.focus?.();
      return;
    }
    void save.submitSaveDialog(name);
  });

  if (readOnlyView) {
    setStatus('Read-only view');
  } else if (editShareMode) {
    setStatus('Editing via shared link');
  }

  syncAuthUi();

  return {
    destroy() {
      document.removeEventListener('keydown', onSaveShortcut, true);
      if (typeof unsub === 'function') unsub();
    },
    syncSaveLabel,
    /** Re-evaluate Save enabled/label after dirty or outline-id changes. */
    syncSaveState: syncAuthUi,
    saveCurrent: save.saveCurrent,
  };
}
