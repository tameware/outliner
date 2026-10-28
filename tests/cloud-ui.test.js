import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountCloudUi } from '../cloud-ui.js';

function setupDom() {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <nav class="menubar">
      <button type="button" id="menu-open" disabled>Open…</button>
      <button type="button" id="menu-save" disabled>Save…</button>
      <button type="button" id="menu-save-as" disabled>Save As…</button>
    </nav>
    <div class="cloud-bar" data-cloud-bar hidden>
      <button type="button" id="btn-sign-in">Sign in</button>
      <button type="button" id="btn-sign-out" hidden>Sign out</button>
      <span id="cloud-user" hidden></span>
      <button type="button" id="btn-cloud-share" disabled>Copy read-only link</button>
      <button type="button" id="btn-cloud-share-edit" disabled>Copy editable link</button>
      <dialog id="cloud-save-dialog">
        <form method="dialog" id="cloud-save-form">
          <h2>Save to cloud</h2>
          <label>Name <input id="cloud-save-name" name="name" required /></label>
          <button type="submit" id="btn-cloud-save-confirm">Save</button>
          <button type="button" id="btn-cloud-save-cancel" value="cancel">Cancel</button>
        </form>
      </dialog>
      <dialog id="cloud-open-dialog">
        <ul id="cloud-outline-list"></ul>
        <button type="button" id="btn-cloud-open-cancel">Cancel</button>
      </dialog>
      <dialog id="cloud-share-dialog">
        <h2 id="cloud-share-heading">Read-only link</h2>
        <p id="cloud-share-hint" class="cloud-share-hint"></p>
        <input id="cloud-share-url" readonly />
        <button type="button" id="btn-cloud-share-copy">Copy</button>
        <button type="button" id="btn-cloud-share-close">Close</button>
      </dialog>
      <p id="cloud-status" role="status"></p>
    </div>
    <ol data-outline-root></ol>
  </body></html>`, { url: 'http://localhost/outliner/', pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLDialogElement = dom.window.HTMLDialogElement;
  for (const id of ['cloud-save-dialog', 'cloud-open-dialog', 'cloud-share-dialog']) {
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
  let outlineId;

  beforeEach(() => {
    dom = setupDom();
    signedInUser = { uid: 'u1', displayName: 'Ada', email: 'ada@example.com' };
    createdCalls = [];
    savedCalls = [];
    outlineId = null;
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
    };
    outline = {
      root: document.querySelector('[data-outline-root]'),
      toOpml: () => '<opml></opml>',
      parseOpml: () => ({ title: 'Bridge notes', items: [] }),
      loadOutline: () => {},
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
      syncUrl: () => {},
    };
  });

  it('shows the cloud bar when configured and enables save after sign-in', async () => {
    signedInUser = null;
    const ui = mountCloudUi({
      auth,
      cloud,
      outline,
      configured: true,
    });
    const bar = document.querySelector('[data-cloud-bar]');
    assert.equal(bar.hidden, false);
    assert.equal(document.getElementById('menu-save').disabled, true);

    document.getElementById('btn-sign-in').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(document.getElementById('menu-save').disabled, false);
    assert.equal(document.getElementById('menu-save').textContent, 'Save…');
    assert.equal(document.getElementById('cloud-user').hidden, false);
    assert.match(document.getElementById('cloud-user').textContent, /Ada/);
    ui.destroy();
  });

  it('keeps the cloud bar hidden when not configured', () => {
    mountCloudUi({
      auth,
      cloud,
      outline,
      configured: false,
    });
    assert.equal(document.querySelector('[data-cloud-bar]').hidden, true);
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
    const labels = [...document.querySelectorAll('#cloud-outline-list button')].map(
      (b) => b.textContent,
    );
    assert.deepEqual(labels, ['Bridge notes', 'Shopping']);
  });

  it('stores server revision when opening so a later save can send If-Match', async () => {
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

  it('creates a read-only share link for the current saved outline', async () => {
    outlineId = 'existing-1';
    const written = mockClipboard();
    cloud.createShareLink = async () => ({
      token: 'file-1',
      urlPath: '/outliner/?id=file-1&view=1',
    });
    mountCloudUi({ auth, cloud, outline, configured: true });
    document.getElementById('btn-cloud-share').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const dialog = document.getElementById('cloud-share-dialog');
    assert.ok(dialog.hasAttribute('open'));
    assert.match(document.getElementById('cloud-share-url').value, /id=file-1.*view=1/);
    assert.match(document.getElementById('cloud-share-heading').textContent, /read-only/i);
    assert.equal(written.length, 1);
    assert.match(written[0], /id=file-1/);
  });

  it('creates an editable share link for the current saved outline', async () => {
    outlineId = 'existing-1';
    const written = mockClipboard();
    cloud.createEditShareLink = async () => ({
      token: 'file-1',
      urlPath: '/outliner/?id=file-1',
    });
    mountCloudUi({ auth, cloud, outline, configured: true });
    document.getElementById('btn-cloud-share-edit').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    assert.ok(document.getElementById('cloud-share-dialog').hasAttribute('open'));
    assert.match(document.getElementById('cloud-share-url').value, /id=file-1/);
    assert.doesNotMatch(document.getElementById('cloud-share-url').value, /view=/);
    assert.match(document.getElementById('cloud-share-heading').textContent, /editable/i);
    assert.match(document.getElementById('cloud-share-hint').textContent, /edit/i);
    assert.equal(written.length, 1);
    assert.match(written[0], /id=file-1/);
  });

  it('in editShareMode enables Save without sign-in and hides share/open chrome', async () => {
    signedInUser = null;
    outlineId = 'shared-edit-1';
    mountCloudUi({
      auth,
      cloud,
      outline,
      configured: true,
      editShareMode: true,
    });
    assert.equal(document.getElementById('btn-sign-in').hidden, true);
    assert.equal(document.getElementById('btn-cloud-share').hidden, true);
    assert.equal(document.getElementById('btn-cloud-share-edit').hidden, true);
    assert.equal(document.getElementById('menu-open').hidden, true);
    assert.equal(document.getElementById('menu-save-as').hidden, true);
    assert.equal(document.getElementById('menu-save').disabled, false);
    assert.equal(document.getElementById('menu-save').hidden, false);
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
