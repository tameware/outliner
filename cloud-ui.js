/**
 * Toolbar/UI wiring for optional cloud auth and save/restore.
 */

/**
 * @param {object} options
 * @param {boolean} options.configured
 * @param {boolean} [options.readOnlyView]
 * @param {{ onAuthStateChanged: Function, signInWithGoogle: Function, signOut: Function }} options.auth
 * @param {ReturnType<import('./cloud.js').createCloudClient>} options.cloud
 * @param {object} options.outline
 */
export function mountCloudUi({ configured, auth, cloud, outline, readOnlyView = false }) {
  const bar = document.querySelector('[data-cloud-bar]');
  const btnSignIn = document.getElementById('btn-sign-in');
  const btnSignOut = document.getElementById('btn-sign-out');
  const userEl = document.getElementById('cloud-user');
  const btnSave = document.getElementById('btn-cloud-save');
  const btnOpen = document.getElementById('btn-cloud-open');
  const btnShare = document.getElementById('btn-cloud-share');
  const saveDialog = document.getElementById('cloud-save-dialog');
  const saveForm = document.getElementById('cloud-save-form');
  const saveNameInput = document.getElementById('cloud-save-name');
  const btnSaveCancel = document.getElementById('btn-cloud-save-cancel');
  const openDialog = document.getElementById('cloud-open-dialog');
  const listEl = document.getElementById('cloud-outline-list');
  const btnCancel = document.getElementById('btn-cloud-open-cancel');
  const shareDialog = document.getElementById('cloud-share-dialog');
  const shareUrlInput = document.getElementById('cloud-share-url');
  const btnShareCopy = document.getElementById('btn-cloud-share-copy');
  const btnShareClose = document.getElementById('btn-cloud-share-close');
  const statusEl = document.getElementById('cloud-status');

  if (!bar) {
    return { destroy() {} };
  }

  if (!configured) {
    bar.hidden = true;
    return { destroy() {} };
  }

  bar.hidden = false;
  let user = null;
  let busy = false;

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message || '';
  }

  function syncAuthUi() {
    const signedIn = Boolean(user);
    if (btnSignIn) btnSignIn.hidden = signedIn || readOnlyView;
    if (btnSignOut) btnSignOut.hidden = !signedIn || readOnlyView;
    if (userEl) {
      userEl.hidden = !signedIn || readOnlyView;
      userEl.textContent = signedIn
        ? user.displayName || user.email || user.uid || 'Signed in'
        : '';
    }
    const canMutate = signedIn && !busy && !readOnlyView;
    if (btnSave) {
      btnSave.hidden = readOnlyView;
      btnSave.disabled = !canMutate;
    }
    if (btnOpen) {
      btnOpen.hidden = readOnlyView;
      btnOpen.disabled = !canMutate;
    }
    if (btnShare) {
      btnShare.hidden = readOnlyView;
      btnShare.disabled = !canMutate;
    }
  }

  async function withBusy(label, fn) {
    busy = true;
    syncAuthUi();
    setStatus(label);
    try {
      await fn();
      setStatus('');
    } catch (error) {
      const message = error?.message || String(error);
      setStatus(message);
      window.alert(message);
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

  function onSave() {
    if (saveNameInput) {
      saveNameInput.value = outline.getTitle?.() || 'Untitled';
    }
    openDialogEl(saveDialog);
    saveNameInput?.focus?.();
    saveNameInput?.select?.();
  }

  async function saveWithName(title) {
    const name = String(title || '').trim() || 'Untitled';
    await withBusy('Saving to cloud…', async () => {
      const previousTitle = String(outline.getTitle?.() || '').trim();
      let id = outline.getOutlineId?.();
      // New name while an outline is open → Save As (create), so Open can list each name.
      const saveAsNew = Boolean(id) && name !== previousTitle;

      outline.setTitle?.(name);
      const opml = outline.toOpml();

      if (!id || saveAsNew) {
        if (saveAsNew) {
          outline.setOutlineId?.(null);
          outline.setRevision?.(null);
          outline.setLeaseToken?.(null);
        }
        const created = await cloud.createOutline({ title: name, opml });
        id = created.id;
        const revision = created.revision ?? 1;
        outline.setOutlineId?.(id);
        outline.setRevision?.(revision);
        outline.setLeaseToken?.(null);
        if (outline.syncUrl) outline.syncUrl(id);
        setStatus(`Saved “${name}”`);
        return;
      }

      let revision = outline.getRevision?.();
      let leaseToken = outline.getLeaseToken?.();

      if (revision == null && cloud.getOutline) {
        const got = await cloud.getOutline(id);
        revision = typeof got === 'string' ? null : got.revision;
        outline.setRevision?.(revision);
      }
      if (revision == null) {
        throw new Error('Missing outline revision; reopen from cloud and try again');
      }

      if (!leaseToken && cloud.acquireLock) {
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
      setStatus(`Saved “${name}”`);
    });
  }

  async function onOpen() {
    await withBusy('Loading list…', async () => {
      const outlines = await cloud.listOutlines();
      if (!listEl) return;
      listEl.replaceChildren();
      const sorted = [...outlines].sort((a, b) =>
        String(a.title || a.id).localeCompare(String(b.title || b.id), undefined, {
          sensitivity: 'base',
        }),
      );
      if (!sorted.length) {
        const empty = document.createElement('li');
        empty.textContent = 'No outlines yet. Save to cloud to create one.';
        listEl.appendChild(empty);
      } else {
        for (const item of sorted) {
          const li = document.createElement('li');
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = item.title || item.id;
          btn.addEventListener('click', () => {
            void openOutline(item.id, item.title);
          });
          li.appendChild(btn);
          listEl.appendChild(li);
        }
      }
      openDialogEl(openDialog);
    });
  }

  async function openOutline(id, listedTitle) {
    await withBusy('Opening…', async () => {
      const got = await cloud.getOutline(id);
      const opml = typeof got === 'string' ? got : got.opml;
      const revision = typeof got === 'string' ? null : got.revision;
      const tree = outline.parseOpml(opml);
      outline.loadOutline(tree);
      outline.setOutlineId?.(id);
      outline.setRevision?.(revision ?? tree.revision ?? null);
      outline.setLeaseToken?.(null);
      const title = listedTitle || tree.title;
      outline.setTitle?.(title);
      if (outline.syncUrl) outline.syncUrl(id);
      closeDialog(openDialog);
      setStatus(title ? `Opened “${title}”` : `Opened ${id}`);
    });
  }

  function absoluteShareUrl(urlPath) {
    try {
      return new URL(urlPath, window.location.origin).href;
    } catch {
      return urlPath;
    }
  }

  async function onShare() {
    const id = outline.getOutlineId?.();
    if (!id) {
      window.alert('Save this outline to the cloud before creating a read-only link.');
      return;
    }
    await withBusy('Creating link…', async () => {
      const result = await cloud.createShareLink(id);
      const href = absoluteShareUrl(result.urlPath);
      if (shareUrlInput) shareUrlInput.value = href;
      try {
        await navigator.clipboard?.writeText?.(href);
        setStatus('Read-only link copied');
      } catch {
        setStatus('Read-only link ready');
      }
      openDialogEl(shareDialog);
      shareUrlInput?.focus?.();
      shareUrlInput?.select?.();
    });
  }

  async function onShareCopy() {
    const href = shareUrlInput?.value;
    if (!href) return;
    try {
      await navigator.clipboard.writeText(href);
      setStatus('Read-only link copied');
    } catch {
      shareUrlInput?.select?.();
    }
  }

  function onCancelOpen() {
    closeDialog(openDialog);
  }

  function onCancelSave() {
    closeDialog(saveDialog);
  }

  btnSignIn?.addEventListener('click', () => {
    void onSignIn();
  });
  btnSignOut?.addEventListener('click', () => {
    void onSignOut();
  });
  btnSave?.addEventListener('click', () => {
    onSave();
  });
  btnOpen?.addEventListener('click', () => {
    void onOpen();
  });
  btnShare?.addEventListener('click', () => {
    void onShare();
  });
  btnCancel?.addEventListener('click', onCancelOpen);
  btnSaveCancel?.addEventListener('click', onCancelSave);
  btnShareCopy?.addEventListener('click', () => {
    void onShareCopy();
  });
  btnShareClose?.addEventListener('click', () => closeDialog(shareDialog));
  saveForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = saveNameInput?.value?.trim();
    if (!name) {
      saveNameInput?.focus?.();
      return;
    }
    closeDialog(saveDialog);
    void saveWithName(name);
  });

  if (readOnlyView) {
    setStatus('Read-only view');
  }

  syncAuthUi();

  return {
    destroy() {
      if (typeof unsub === 'function') unsub();
    },
  };
}
