/**
 * Toolbar/UI wiring for optional cloud auth and save/restore.
 */

/**
 * @param {object} options
 * @param {boolean} options.configured
 * @param {{ onAuthStateChanged: Function, signInWithGoogle: Function, signOut: Function }} options.auth
 * @param {ReturnType<import('./cloud.js').createCloudClient>} options.cloud
 * @param {object} options.outline
 */
export function mountCloudUi({ configured, auth, cloud, outline }) {
  const bar = document.querySelector('[data-cloud-bar]');
  const btnSignIn = document.getElementById('btn-sign-in');
  const btnSignOut = document.getElementById('btn-sign-out');
  const userEl = document.getElementById('cloud-user');
  const btnSave = document.getElementById('btn-cloud-save');
  const btnOpen = document.getElementById('btn-cloud-open');
  const saveDialog = document.getElementById('cloud-save-dialog');
  const saveForm = document.getElementById('cloud-save-form');
  const saveNameInput = document.getElementById('cloud-save-name');
  const btnSaveCancel = document.getElementById('btn-cloud-save-cancel');
  const openDialog = document.getElementById('cloud-open-dialog');
  const listEl = document.getElementById('cloud-outline-list');
  const btnCancel = document.getElementById('btn-cloud-open-cancel');
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
    if (btnSignIn) btnSignIn.hidden = signedIn;
    if (btnSignOut) btnSignOut.hidden = !signedIn;
    if (userEl) {
      userEl.hidden = !signedIn;
      userEl.textContent = signedIn
        ? user.displayName || user.email || user.uid || 'Signed in'
        : '';
    }
    if (btnSave) btnSave.disabled = !signedIn || busy;
    if (btnOpen) btnOpen.disabled = !signedIn || busy;
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
      outline.setTitle?.(name);
      const opml = outline.toOpml();
      let id = outline.getOutlineId?.();
      let revision = outline.getRevision?.();
      let leaseToken = outline.getLeaseToken?.();

      if (!id) {
        const created = await cloud.createOutline({ title: name, opml });
        id = created.id;
        revision = created.revision ?? 1;
        outline.setOutlineId?.(id);
        outline.setRevision?.(revision);
        if (outline.syncUrl) outline.syncUrl(id);
        setStatus(`Saved “${name}”`);
        return;
      }

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
  btnCancel?.addEventListener('click', onCancelOpen);
  btnSaveCancel?.addEventListener('click', onCancelSave);
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

  syncAuthUi();

  return {
    destroy() {
      if (typeof unsub === 'function') unsub();
    },
  };
}
