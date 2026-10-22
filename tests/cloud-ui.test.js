import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountCloudUi } from '../cloud-ui.js';

function setupDom() {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div class="cloud-bar" data-cloud-bar hidden>
      <button type="button" id="btn-sign-in">Sign in</button>
      <button type="button" id="btn-sign-out" hidden>Sign out</button>
      <span id="cloud-user" hidden></span>
      <button type="button" id="btn-cloud-save" disabled>Save to cloud</button>
      <button type="button" id="btn-cloud-open" disabled>Open from cloud</button>
      <button type="button" id="btn-cloud-share" disabled>Copy read-only link</button>
      <dialog id="cloud-save-dialog">
        <form method="dialog" id="cloud-save-form">
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
  // jsdom dialog stubs
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
    assert.equal(document.getElementById('btn-cloud-save').disabled, true);

    document.getElementById('btn-sign-in').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(document.getElementById('btn-cloud-save').disabled, false);
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
    document.getElementById('btn-cloud-save').click();
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
    assert.equal(dialog.hasAttribute('open'), false);
  });

  it('lists saved outlines by name when opening from cloud', async () => {
    mountCloudUi({ auth, cloud, outline, configured: true });
    document.getElementById('btn-cloud-open').click();
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
    document.getElementById('btn-cloud-open').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    document.querySelector('#cloud-outline-list button').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(revision, 4);
  });

  it('creates a new cloud outline when saving under a different name (Save As)', async () => {
    outlineId = 'existing-1';
    outline.getTitle = () => 'Old name';
    outline.getRevision = () => 2;
    outline.getLeaseToken = () => 'lease';
    mountCloudUi({ auth, cloud, outline, configured: true });

    document.getElementById('btn-cloud-save').click();
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

  it('updates the current cloud outline when saving under the same name', async () => {
    outlineId = 'existing-1';
    outline.getTitle = () => 'Same name';
    outline.getRevision = () => 2;
    outline.getLeaseToken = () => 'lease';
    mountCloudUi({ auth, cloud, outline, configured: true });

    document.getElementById('btn-cloud-save').click();
    await new Promise((r) => setTimeout(r, 0));
    document.getElementById('cloud-save-name').value = 'Same name';
    document.getElementById('cloud-save-form').dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true }),
    );
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(createdCalls.length, 0);
    assert.equal(savedCalls.length, 1);
    assert.equal(savedCalls[0].id, 'existing-1');
  });

  it('creates a read-only share link for the current saved outline', async () => {
    outlineId = 'existing-1';
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
    cloud.createShareLink = async () => ({
      token: 'share-tok',
      urlPath: '/outliner/?view=share-tok',
    });
    mountCloudUi({ auth, cloud, outline, configured: true });
    document.getElementById('btn-cloud-share').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const dialog = document.getElementById('cloud-share-dialog');
    assert.ok(dialog.hasAttribute('open'));
    assert.match(document.getElementById('cloud-share-url').value, /view=share-tok/);
    assert.equal(written.length, 1);
    assert.match(written[0], /view=share-tok/);
  });
});
