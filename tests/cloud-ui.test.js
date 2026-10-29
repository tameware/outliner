import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountCloudUi } from '../cloud-ui.js';

function setupDom() {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <nav class="menubar">
      <div class="menu" data-menu="cloud" hidden>
        <button type="button" class="menu-label">Cloud</button>
        <div class="menu-panel" role="menu">
          <button type="button" role="menuitem" id="menu-cloud-auth">Sign in with Google</button>
          <button type="button" role="menuitem" id="menu-cloud-share" disabled>Copy read-only link</button>
          <button type="button" role="menuitem" id="menu-cloud-share-edit" disabled>Copy editable link</button>
        </div>
      </div>
      <button type="button" id="menu-open" disabled>Open…</button>
      <button type="button" id="menu-insert" disabled>Insert…</button>
      <button type="button" id="menu-save" disabled>Save…</button>
      <button type="button" id="menu-save-as" disabled>Save As…</button>
      <button type="button" id="menu-delete" disabled>Delete…</button>
    </nav>
    <div class="cloud-bar" data-cloud-bar hidden>
      <span id="cloud-user" hidden></span>
      <dialog id="cloud-save-dialog">
        <form method="dialog" id="cloud-save-form">
          <h2>Save to cloud</h2>
          <label>Name <input id="cloud-save-name" name="name" required /></label>
          <button type="submit" id="btn-cloud-save-confirm">Save</button>
          <button type="button" id="btn-cloud-save-cancel" value="cancel">Cancel</button>
        </form>
      </dialog>
      <dialog id="cloud-open-dialog">
        <h2>Open from Google Drive</h2>
        <ul id="cloud-outline-list"></ul>
        <button type="button" id="btn-cloud-open-cancel">Cancel</button>
      </dialog>
      <dialog id="cloud-delete-dialog">
        <ul id="cloud-delete-list"></ul>
        <button type="button" id="btn-cloud-delete-cancel">Cancel</button>
      </dialog>
      <p id="cloud-status" role="status"></p>
    </div>
    <ol data-outline-root></ol>
  </body></html>`, { url: 'http://localhost/outliner/', pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLDialogElement = dom.window.HTMLDialogElement;
  for (const id of ['cloud-save-dialog', 'cloud-open-dialog', 'cloud-delete-dialog']) {
    const el = document.getElementById(id);
    el.showModal = () => {
      el.setAttribute('open', '');
    };
    el.close = () => {
      el.removeAttribute('open');
    };
  }
  return dom;
}

describe('cloud UI', () => {
  let dom;
  let auth;
  let cloud;
  let outline;
  let signedInUser;
  let createdCalls;
  let savedCalls;
  let deletedCalls;
  let outlineId;
  let syncUrlCalls;
  let outlineDirty;
  let alerts;

  beforeEach(() => {
    dom = setupDom();
    signedInUser = { uid: 'u1', displayName: 'Ada', email: 'ada@example.com' };
    createdCalls = [];
    savedCalls = [];
    deletedCalls = [];
    syncUrlCalls = [];
    outlineId = null;
    outlineDirty = false;
    alerts = [];
    window.confirm = () => true;
    window.alert = (msg) => {
      alerts.push(String(msg));
    };
    const listeners = [];
    auth = {
      onAuthStateChanged(cb) {
        listeners.push(cb);
        cb(signedInUser);
        return () => {};
      },
      async signInWithGoogle() {
        signedInUser = { uid: 'u1', displayName: 'Ada', email: 'ada@example.com' };
        listeners.forEach((cb) => cb(signedInUser));
      },
      async signOut() {
        signedInUser = null;
        listeners.forEach((cb) => cb(null));
      },
      async getIdToken() {
        return 'tok';
      },
    };
    cloud = {
      listOutlines: async () => [
        { id: 'o1', title: 'Bridge notes' },
        { id: 'o2', title: 'Shopping' },
      ],
      getOutline: async (id) => ({
        opml: `<?xml version="1.0"?><opml version="2.0"><head><title>${id}</title></head><body></body></opml>`,
        revision: 4,
      }),
      createOutline: async (args) => {
        createdCalls.push(args);
        return { id: 'new-1', revision: 1 };
      },
      saveOutline: async (id, args) => {
        savedCalls.push({ id, ...args });
        return { id, revision: 2 };
      },
      acquireLock: async () => ({ token: 'lease', leaseUntil: '2099-01-01' }),
      releaseLock: async () => {},
      createShareLink: async (id) => ({
        token: 'share-tok',
        urlPath: `/outliner/?view=share-tok&from=${id}`,
      }),
      deleteOutline: async (id) => {
        deletedCalls.push(id);
      },
    };
    outline = {
      root: document.querySelector('[data-outline-root]'),
      toOpml: () => '<opml></opml>',
      parseOpml: () => ({ title: 'Bridge notes', items: [] }),
      loadOutline: () => {},
      insertOutline: () => {},
      getTitle: () => 'Untitled outline',
      setTitle: (t) => {
        outline._title = t;
      },
      getOutlineId: () => outlineId,
      setOutlineId: (id) => {
        outlineId = id;
      },
      getRevision: () => (outlineId ? 1 : null),
      setRevision: () => {},
      getLeaseToken: () => null,
      setLeaseToken: () => {},
      syncUrl: (id) => {
        syncUrlCalls.push(id);
      },
      isDirty: () => outlineDirty,
    };
  });

  it('shows Cloud menu and status bar when configured; auth item becomes Sign out', async () => {
    signedInUser = null;
    const ui = mountCloudUi({
      auth,
      cloud,
      outline,
      configured: true,
    });
    const bar = document.querySelector('[data-cloud-bar]');
    const cloudMenu = document.querySelector('[data-menu="cloud"]');
    assert.equal(bar.hidden, false);
    assert.equal(cloudMenu.hidden, false);
    assert.equal(document.getElementById('menu-save').disabled, true);
    const authItem = document.getElementById('menu-cloud-auth');
    assert.equal(authItem.textContent, 'Sign in with Google');

    authItem.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(document.getElementById('menu-save').disabled, false);
    assert.equal(document.getElementById('menu-save').textContent, 'Save…');
    assert.equal(authItem.textContent, 'Sign out');
    assert.equal(document.getElementById('cloud-user').hidden, false);
    assert.match(document.getElementById('cloud-user').textContent, /Ada/);
    ui.destroy();
  });

  it('keeps Cloud menu and status bar hidden when not configured', () => {
    mountCloudUi({
      auth,
      cloud,
      outline,
      configured: false,
    });
    assert.equal(document.querySelector('[data-cloud-bar]').hidden, true);
    assert.equal(document.querySelector('[data-menu="cloud"]').hidden, true);
  });

  it('asks for a name before saving a new outline to the cloud', async () => {
    mountCloudUi({ auth, cloud, outline, configured: true });
    document.getElementById('menu-save').click();
    await new Promise((r) => setTimeout(r, 0));

    const dialog = document.getElementById('cloud-save-dialog');
    assert.ok(dialog.hasAttribute('open'), 'save dialog should open');
    const input = document.getElementById('cloud-save-name');
    assert.equal(input.value, 'Untitled outline');
    input.value = 'My bridge card';
    document.getElementById('cloud-save-form').dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true }),
    );
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(createdCalls.length, 1);
    assert.equal(createdCalls[0].title, 'My bridge card');
    assert.equal(outlineId, 'new-1');
    assert.equal(outline._title, 'My bridge card');
    assert.equal(document.getElementById('menu-save').textContent, 'Save');
    assert.equal(dialog.hasAttribute('open'), false);
  });

  it('lists saved outlines by name when opening from cloud', async () => {
    mountCloudUi({ auth, cloud, outline, configured: true });
    document.getElementById('menu-open').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const dialog = document.getElementById('cloud-open-dialog');
    assert.ok(dialog.hasAttribute('open'));
    assert.match(dialog.querySelector('h2').textContent, /Open from Google Drive/);
    const labels = [...document.querySelectorAll('#cloud-outline-list button')].map(
      (b) => b.textContent,
    );
    assert.deepEqual(labels, ['Bridge notes', 'Shopping']);
  });

  it('enables Insert… with Open when signed in', async () => {
    signedInUser = null;
    mountCloudUi({ auth, cloud, outline, configured: true });
    assert.equal(document.getElementById('menu-insert').disabled, true);
    document.getElementById('menu-cloud-auth').click();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(document.getElementById('menu-insert').disabled, false);
    assert.equal(document.getElementById('menu-open').disabled, false);
  });

  it('lists Drive outlines for Insert… and inserts without replacing the current outline', async () => {
    outlineId = 'current-1';
    outline._title = 'Current';
    outline.getTitle = () => outline._title;
    const inserts = [];
    const loads = [];
    outline.insertOutline = (tree) => {
      inserts.push(tree);
    };
    outline.loadOutline = () => {
      loads.push(1);
    };
    outline.beforeReplace = async () => {
      throw new Error('Insert must not ask beforeReplace');
    };
    mountCloudUi({ auth, cloud, outline, configured: true });

    document.getElementById('menu-insert').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const dialog = document.getElementById('cloud-open-dialog');
    assert.ok(dialog.hasAttribute('open'));
    assert.match(dialog.querySelector('h2').textContent, /Insert from Google Drive/);
    const labels = [...document.querySelectorAll('#cloud-outline-list button')].map(
      (b) => b.textContent,
    );
    assert.deepEqual(labels, ['Bridge notes', 'Shopping']);

    document.querySelector('#cloud-outline-list button').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(inserts.length, 1);
    assert.equal(loads.length, 0);
    assert.equal(outlineId, 'current-1');
    assert.equal(outline._title, 'Current');
    assert.equal(syncUrlCalls.length, 0);
    assert.equal(dialog.hasAttribute('open'), false);
    assert.match(document.getElementById('cloud-status').textContent, /Inserted/);
  });

  it('lists saved outlines when deleting and trashes the chosen file after confirm', async () => {
    mountCloudUi({ auth, cloud, outline, configured: true });
    document.getElementById('menu-delete').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const dialog = document.getElementById('cloud-delete-dialog');
    assert.ok(dialog.hasAttribute('open'));
    const labels = [...document.querySelectorAll('#cloud-delete-list button')].map(
      (b) => b.textContent,
    );
    assert.deepEqual(labels, ['Bridge notes', 'Shopping']);

    document.querySelector('#cloud-delete-list button').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    assert.deepEqual(deletedCalls, ['o1']);
    assert.equal(dialog.hasAttribute('open'), false);
    assert.match(document.getElementById('cloud-status').textContent, /deleted/i);
  });

  it('does not delete when the user cancels the confirm', async () => {
    window.confirm = () => false;
    mountCloudUi({ auth, cloud, outline, configured: true });
    document.getElementById('menu-delete').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    document.querySelector('#cloud-delete-list button').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(deletedCalls, []);
    assert.ok(document.getElementById('cloud-delete-dialog').hasAttribute('open'));
  });

  it('clears the current outline id when deleting the open file', async () => {
    outlineId = 'o1';
    mountCloudUi({ auth, cloud, outline, configured: true });
    document.getElementById('menu-delete').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    document.querySelector('#cloud-delete-list button').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(outlineId, null);
    assert.ok(syncUrlCalls.includes(null));
  });

  it('stores server revision when opening when Drive provides one', async () => {
    let revision = null;
    outline.setRevision = (rev) => {
      revision = rev;
    };
    outline.getRevision = () => revision;
    mountCloudUi({ auth, cloud, outline, configured: true });
    document.getElementById('menu-open').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    document.querySelector('#cloud-outline-list button').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(revision, 4);
    assert.equal(document.getElementById('menu-save').textContent, 'Save');
  });

  it('Save As always creates a new cloud outline', async () => {
    outlineId = 'existing-1';
    outline.getTitle = () => 'Old name';
    outline.getRevision = () => 2;
    outline.getLeaseToken = () => 'lease';
    mountCloudUi({ auth, cloud, outline, configured: true });

    document.getElementById('menu-save-as').click();
    await new Promise((r) => setTimeout(r, 0));
    document.getElementById('cloud-save-name').value = 'Brand new name';
    document.getElementById('cloud-save-form').dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true }),
    );
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(createdCalls.length, 1);
    assert.equal(createdCalls[0].title, 'Brand new name');
    assert.equal(savedCalls.length, 0);
    assert.equal(outlineId, 'new-1');
  });

  it('Save updates the current cloud outline without a name dialog', async () => {
    outlineId = 'existing-1';
    outline.getTitle = () => 'Same name';
    outline.getRevision = () => 2;
    outline.getLeaseToken = () => 'stale-lease';
    const lockCalls = [];
    cloud.acquireLock = async (id) => {
      lockCalls.push(id);
      return { token: 'fresh-lease', leaseUntil: '2099-01-01' };
    };
    mountCloudUi({ auth, cloud, outline, configured: true });

    document.getElementById('menu-save').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(
      document.getElementById('cloud-save-dialog').hasAttribute('open'),
      false,
    );
    assert.equal(createdCalls.length, 0);
    assert.equal(savedCalls.length, 1);
    assert.equal(savedCalls[0].id, 'existing-1');
    assert.deepEqual(lockCalls, ['existing-1']);
    assert.equal(savedCalls[0].leaseToken, 'fresh-lease');
  });

  it('Save works without a revision (Drive v3 often has no ETag)', async () => {
    outlineId = 'existing-1';
    outline.getTitle = () => 'Same name';
    outline.getRevision = () => null;
    cloud.getOutline = async () => ({
      opml: '<?xml version="1.0"?><opml version="2.0"><body></body></opml>',
      revision: null,
    });
    mountCloudUi({ auth, cloud, outline, configured: true });

    document.getElementById('menu-save').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(savedCalls.length, 1);
    assert.equal(savedCalls[0].id, 'existing-1');
    assert.equal(savedCalls[0].revision, null);
    assert.equal(document.getElementById('cloud-status').textContent, '');
  });

  function mockClipboard() {
    const written = [];
    const clipboard = {
      writeText: async (text) => {
        written.push(text);
      },
    };
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: clipboard,
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: window.navigator,
    });
    return written;
  }

  it('copies a read-only share link to the clipboard without a dialog', async () => {
    outlineId = 'existing-1';
    const written = mockClipboard();
    cloud.createShareLink = async () => ({
      token: 'view-opaque',
      urlPath: '/outliner/?view=view-opaque',
    });
    mountCloudUi({ auth, cloud, outline, configured: true });
    document.getElementById('menu-cloud-share').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(written.length, 1);
    assert.match(written[0], /[?&]view=view-opaque/);
    assert.doesNotMatch(written[0], /[?&]id=/);
    assert.match(document.getElementById('cloud-status').textContent, /read-only link copied/i);
  });

  it('asks to save before a read-only link when the outline has no Drive id', async () => {
    outlineId = null;
    const shareCalls = [];
    cloud.createShareLink = async (id) => {
      shareCalls.push(id);
      return { token: 'x', urlPath: '/outliner/?view=x' };
    };
    mountCloudUi({ auth, cloud, outline, configured: true });
    document.getElementById('menu-cloud-share').click();
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(shareCalls.length, 0);
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /Save this outline to Google Drive before creating a read-only link/i);
  });

  it('asks to save before a read-only link when the outline is dirty', async () => {
    outlineId = 'stale-other-doc';
    outlineDirty = true;
    const shareCalls = [];
    cloud.createShareLink = async (id) => {
      shareCalls.push(id);
      return { token: 'x', urlPath: `/outliner/?view=x&from=${id}` };
    };
    mountCloudUi({ auth, cloud, outline, configured: true });
    document.getElementById('menu-cloud-share').click();
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(shareCalls.length, 0);
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /Save this outline to Google Drive before creating a read-only link/i);
  });

  it('copies an editable share link to the clipboard without a dialog', async () => {
    outlineId = 'existing-1';
    const written = mockClipboard();
    cloud.createEditShareLink = async () => ({
      token: 'edit-opaque',
      urlPath: '/outliner/?edit=edit-opaque',
    });
    mountCloudUi({ auth, cloud, outline, configured: true });
    document.getElementById('menu-cloud-share-edit').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(written.length, 1);
    assert.match(written[0], /[?&]edit=edit-opaque/);
    assert.doesNotMatch(written[0], /[?&]id=/);
    assert.doesNotMatch(written[0], /view=/);
    assert.match(document.getElementById('cloud-status').textContent, /editable link copied/i);
  });

  it('asks to save before an editable link when the outline is dirty', async () => {
    outlineId = 'stale-other-doc';
    outlineDirty = true;
    const shareCalls = [];
    cloud.createEditShareLink = async (id) => {
      shareCalls.push(id);
      return { token: 'x', urlPath: `/outliner/?edit=x&from=${id}` };
    };
    mountCloudUi({ auth, cloud, outline, configured: true });
    document.getElementById('menu-cloud-share-edit').click();
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(shareCalls.length, 0);
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /Save this outline to Google Drive before creating an editable link/i);
  });

  it('in editShareMode enables Save without sign-in and hides Cloud menu chrome', async () => {
    signedInUser = null;
    outlineId = 'shared-edit-1';
    mountCloudUi({
      auth,
      cloud,
      outline,
      configured: true,
      editShareMode: true,
    });
    assert.equal(document.querySelector('[data-menu="cloud"]').hidden, true);
    assert.equal(document.getElementById('menu-open').hidden, true);
    assert.equal(document.getElementById('menu-insert').hidden, true);
    assert.equal(document.getElementById('menu-delete').hidden, true);
    assert.equal(document.getElementById('menu-save-as').hidden, true);
    assert.equal(document.getElementById('menu-save').disabled, false);
    assert.equal(document.getElementById('menu-save').hidden, false);
  });

  it('in editShareMode Save overwrites the same outline id even if the title changed', async () => {
    signedInUser = null;
    outlineId = 'shared-edit-1';
    outline.getTitle = () => 'Old title';
    outline.getRevision = () => null;
    mountCloudUi({
      auth,
      cloud,
      outline,
      configured: true,
      editShareMode: true,
    });
    // Title differs from previous — must not create a new owner outline.
    outline.getTitle = () => 'Renamed by guest';
    document.getElementById('menu-save').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(createdCalls.length, 0);
    assert.equal(savedCalls.length, 1);
    assert.equal(savedCalls[0].id, 'shared-edit-1');
    assert.equal(outlineId, 'shared-edit-1');
  });

  it('asks beforeReplace before opening a listed outline and aborts when denied', async () => {
    const loads = [];
    outline.loadOutline = () => {
      loads.push(1);
    };
    outline.beforeReplace = async () => false;
    mountCloudUi({ auth, cloud, outline, configured: true });
    document.getElementById('menu-open').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    document.querySelector('#cloud-outline-list button').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(loads.length, 0);
  });

  it('saveCurrent marks clean after a successful overwrite save', async () => {
    outlineId = 'existing-1';
    outline.getTitle = () => 'Same name';
    outline.getRevision = () => 2;
    outline.getLeaseToken = () => 'lease';
    let cleaned = 0;
    outline.markClean = () => {
      cleaned += 1;
    };
    const ui = mountCloudUi({ auth, cloud, outline, configured: true });
    const ok = await ui.saveCurrent();
    assert.equal(ok, true);
    assert.equal(savedCalls.length, 1);
    assert.equal(cleaned, 1);
  });

  it('saveCurrent resolves false when the name dialog is cancelled', async () => {
    const ui = mountCloudUi({ auth, cloud, outline, configured: true });
    const pending = ui.saveCurrent();
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(document.getElementById('cloud-save-dialog').hasAttribute('open'));
    document.getElementById('btn-cloud-save-cancel').click();
    assert.equal(await pending, false);
    assert.equal(createdCalls.length, 0);
  });
});
