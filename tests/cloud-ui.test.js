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
      <dialog id="cloud-open-dialog">
        <ul id="cloud-outline-list"></ul>
        <button type="button" id="btn-cloud-open-cancel">Cancel</button>
      </dialog>
      <p id="cloud-status" role="status"></p>
    </div>
    <ol data-outline-root></ol>
  </body></html>`, { url: 'http://localhost/outliner/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLDialogElement = dom.window.HTMLDialogElement;
  return dom;
}

describe('cloud UI', () => {
  let dom;
  let auth;
  let cloud;
  let outline;
  let signedInUser;

  beforeEach(() => {
    dom = setupDom();
    signedInUser = null;
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
      listOutlines: async () => [{ id: 'o1', title: 'One' }],
      getOutline: async () => '<?xml version="1.0"?><opml version="2.0"><head><title>One</title></head><body></body></opml>',
      createOutline: async () => ({ id: 'new-1', revision: 1 }),
      saveOutline: async () => ({ id: 'o1', revision: 2 }),
      acquireLock: async () => ({ token: 'lease', leaseUntil: '2099-01-01' }),
      releaseLock: async () => {},
    };
    outline = {
      root: document.querySelector('[data-outline-root]'),
      toOpml: () => '<opml></opml>',
      parseOpml: () => ({ title: 'One', items: [] }),
      loadOutline: () => {},
      getTitle: () => 'Untitled',
      setTitle: () => {},
      getOutlineId: () => null,
      setOutlineId: () => {},
      getRevision: () => null,
      setRevision: () => {},
    };
  });

  it('shows the cloud bar when configured and enables save after sign-in', async () => {
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
});
