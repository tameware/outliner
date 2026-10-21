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
  const dialog = document.getElementById('cloud-open-dialog');
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

  async function onSave() {
    await withBusy('Saving to cloud…', async () => {
      const opml = outline.toOpml();
      const title = outline.getTitle?.() || 'Outline';
      let id = outline.getOutlineId?.();
      let revision = outline.getRevision?.();
      let leaseToken = outline.getLeaseToken?.();

      if (!id) {
        const created = await cloud.createOutline({ title, opml });
        id = created.id;
        revision = created.revision ?? 1;
        outline.setOutlineId?.(id);
        outline.setRevision?.(revision);
        if (outline.syncUrl) outline.syncUrl(id);
        setStatus(`Saved as ${id}`);
        return;
      }

      if (!leaseToken && cloud.acquireLock) {
        const lease = await cloud.acquireLock(id);
        leaseToken = lease.token;
        outline.setLeaseToken?.(leaseToken);
      }

      const saved = await cloud.saveOutline(id, { opml, revision, leaseToken });
      outline.setRevision?.(saved?.revision ?? revision);
      setStatus('Saved to cloud');
    });
  }

  async function onOpen() {
    await withBusy('Loading list…', async () => {
      const outlines = await cloud.listOutlines();
      if (!listEl) return;
      listEl.replaceChildren();
      if (!outlines.length) {
        const empty = document.createElement('li');
        empty.textContent = 'No outlines yet. Save to cloud to create one.';
        listEl.appendChild(empty);
      } else {
        for (const item of outlines) {
          const li = document.createElement('li');
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = item.title || item.id;
          btn.addEventListener('click', () => {
            void openOutline(item.id);
          });
          li.appendChild(btn);
          listEl.appendChild(li);
        }
      }
      if (dialog?.showModal) dialog.showModal();
      else if (dialog) dialog.setAttribute('open', '');
    });
  }

  async function openOutline(id) {
    await withBusy('Opening…', async () => {
      const opml = await cloud.getOutline(id);
      const tree = outline.parseOpml(opml);
      outline.loadOutline(tree);
      outline.setOutlineId?.(id);
      outline.setRevision?.(tree.revision ?? null);
      outline.setTitle?.(tree.title);
      if (outline.syncUrl) outline.syncUrl(id);
      if (dialog?.close) dialog.close();
      else if (dialog) dialog.removeAttribute('open');
      setStatus(`Opened ${id}`);
    });
  }

  function onCancel() {
    if (dialog?.close) dialog.close();
    else if (dialog) dialog.removeAttribute('open');
  }

  btnSignIn?.addEventListener('click', () => {
    void onSignIn();
  });
  btnSignOut?.addEventListener('click', () => {
    void onSignOut();
  });
  btnSave?.addEventListener('click', () => {
    void onSave();
  });
  btnOpen?.addEventListener('click', () => {
    void onOpen();
  });
  btnCancel?.addEventListener('click', onCancel);

  syncAuthUi();

  return {
    destroy() {
      if (typeof unsub === 'function') unsub();
    },
  };
}
