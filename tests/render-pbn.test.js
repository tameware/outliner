import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  storePbnRenderSnapshot,
  takePbnRenderSnapshot,
  isPbnRenderLocation,
  pbnRenderKeyFromLocation,
  buildPbnRenderHref,
  openPbnRenderTab,
  applyPbnRenderSnapshot,
  applyMissingPbnRenderSnapshot,
  PBN_RENDER_STORAGE_PREFIX,
  PBN_RENDER_MISSING_MESSAGE,
} from '../src/outliner/render-pbn.js';
import {
  mountOutliner,
  loadOutline,
  toOpml,
  parseOpml,
  setReadOnly,
  isReadOnly,
  getItemText,
} from '../src/outliner/outliner.js';
import {
  applyReadOnlyToolbar,
  READONLY_STATUS_LABEL,
} from '../src/chrome/readonly-toolbar.js';

const SAMPLE =
  '73.QJT.AQ54.T752 QT6.876.KJ9.AQ84 5.A95432.7632.K6 AKJ9842.K.T8.J93';

describe('render-pbn snapshot helpers', () => {
  /** @type {Storage} */
  let storage;

  beforeEach(() => {
    const map = new Map();
    storage = {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => {
        map.set(k, String(v));
      },
      removeItem: (k) => {
        map.delete(k);
      },
    };
  });

  it('stores and takes a one-shot snapshot', () => {
    const key = storePbnRenderSnapshot(
      { title: 'Deals', opml: '<opml/>' },
      storage,
    );
    assert.ok(key);
    assert.ok(storage.getItem(PBN_RENDER_STORAGE_PREFIX + key));
    const got = takePbnRenderSnapshot(key, storage);
    assert.deepEqual(got, { title: 'Deals', opml: '<opml/>' });
    assert.equal(takePbnRenderSnapshot(key, storage), null);
  });

  it('detects render=pbn location and key', () => {
    assert.equal(
      isPbnRenderLocation({ search: '?render=pbn&k=abc' }),
      true,
    );
    assert.equal(pbnRenderKeyFromLocation({ search: '?render=pbn&k=abc' }), 'abc');
    assert.equal(isPbnRenderLocation({ search: '?id=x' }), false);
  });

  it('builds a same-origin href with render=pbn and k', () => {
    const href = buildPbnRenderHref(
      { href: 'http://localhost/outliner/index.html?id=file1' },
      'key9',
    );
    assert.match(href, /render=pbn/);
    assert.match(href, /k=key9/);
    assert.doesNotMatch(href, /id=file1/);
  });

  it('defaults to localStorage so a new tab can read the opener’s snapshot', () => {
    const dom = new JSDOM(`<!DOCTYPE html><body></body>`, {
      url: 'http://localhost/',
    });
    globalThis.window = dom.window;
    const key = storePbnRenderSnapshot({ title: 'T', opml: '<opml/>' });
    assert.ok(dom.window.localStorage.getItem(PBN_RENDER_STORAGE_PREFIX + key));
    assert.equal(
      dom.window.sessionStorage.getItem(PBN_RENDER_STORAGE_PREFIX + key),
      null,
    );
    const got = takePbnRenderSnapshot(key);
    assert.deepEqual(got, { title: 'T', opml: '<opml/>' });
    dom.window.close();
  });
});

describe('openPbnRenderTab', () => {
  /** @type {import('jsdom').JSDOM} */
  let dom;
  /** @type {HTMLElement} */
  let root;
  /** @type {Storage} */
  let storage;
  let opened;
  let beeps;

  beforeEach(() => {
    dom = new JSDOM(
      `<!DOCTYPE html><body>
        <ol class="outline" data-outline-root>
          <li data-item>
            <div class="row">
              <button type="button" class="toggle"></button>
              <div class="text" contenteditable="true"></div>
            </div>
          </li>
        </ol>
      </body>`,
      { url: 'http://localhost/index.html' },
    );
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Node = dom.window.Node;
    globalThis.DOMParser = dom.window.DOMParser;
    globalThis.XMLSerializer = dom.window.XMLSerializer;
    root = document.querySelector('[data-outline-root]');
    mountOutliner(root, { bindEvents: false });
    const map = new Map();
    storage = {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => {
        map.set(k, String(v));
      },
      removeItem: (k) => {
        map.delete(k);
      },
    };
    opened = [];
    beeps = 0;
  });

  afterEach(() => {
    dom.window.close();
  });

  it('beeps and does not open when there are no deal lines', () => {
    loadOutline(root, { items: [{ text: 'No deals', children: [] }] });
    const win = openPbnRenderTab({
      root,
      toOpml,
      getTitle: () => 'T',
      storage,
      locationLike: dom.window.location,
      openWindow: (...args) => {
        opened.push(args);
        return { closed: false };
      },
      beep: () => {
        beeps += 1;
      },
    });
    assert.equal(win, null);
    assert.equal(beeps, 1);
    assert.equal(opened.length, 0);
  });

  it('stores a snapshot and opens ?render=pbn&k=…', () => {
    loadOutline(root, {
      items: [{ text: `N:${SAMPLE}`, children: [] }],
    });
    const win = openPbnRenderTab({
      root,
      toOpml,
      getTitle: () => 'Board 1',
      storage,
      locationLike: dom.window.location,
      openWindow: (href, target, features) => {
        opened.push({ href, target, features });
        return { closed: false };
      },
      beep: () => {
        beeps += 1;
      },
    });
    assert.ok(win);
    assert.equal(beeps, 0);
    assert.equal(opened.length, 1);
    assert.match(opened[0].href, /render=pbn/);
    assert.match(opened[0].href, /[?&]k=/);
    assert.equal(opened[0].target, '_blank');
    const key = new URL(opened[0].href, 'http://localhost/').searchParams.get('k');
    const snap = takePbnRenderSnapshot(key, storage);
    assert.equal(snap.title, 'Board 1');
    assert.match(snap.opml, /N:73\.QJT/);
  });
});

describe('applyPbnRenderSnapshot', () => {
  /** @type {import('jsdom').JSDOM} */
  let dom;
  /** @type {HTMLElement} */
  let root;

  beforeEach(() => {
    dom = new JSDOM(
      `<!DOCTYPE html><body>
        <div class="chrome-meta">
          <div class="cloud-bar" data-cloud-bar hidden>
            <p id="cloud-status" class="cloud-status" role="status"></p>
          </div>
        </div>
        <nav class="menubar">
          <div class="menu" data-menu="view">
            <button type="button" role="menuitem" id="menu-expand-all">Expand All</button>
            <button type="button" role="menuitem" id="menu-collapse-all">Collapse All</button>
            <button type="button" role="menuitem" id="menu-render-pbn">Render PBN</button>
            <button type="button" role="menuitem" id="menu-clear">Clear</button>
          </div>
        </nav>
        <ol class="outline" data-outline-root>
          <li data-item>
            <div class="row">
              <button type="button" class="toggle"></button>
              <div class="text" contenteditable="true"></div>
            </div>
          </li>
        </ol>
      </body>`,
      { url: 'http://localhost/?render=pbn&k=test' },
    );
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Node = dom.window.Node;
    globalThis.DOMParser = dom.window.DOMParser;
    globalThis.XMLSerializer = dom.window.XMLSerializer;
    root = document.querySelector('[data-outline-root]');
    mountOutliner(root, { bindEvents: false });
  });

  afterEach(() => {
    dom.window.close();
  });

  it('loads OPML read-only and replaces deal lines with diagrams', () => {
    const opml = toOpml(
      (() => {
        loadOutline(root, {
          items: [
            { text: 'Intro', children: [] },
            { text: `[Deal "N:${SAMPLE}"]`, children: [] },
          ],
        });
        return root;
      })(),
      { title: 'My deals' },
    );
    loadOutline(root, { items: [{ text: '', children: [] }] });

    let titled = '';
    const ok = applyPbnRenderSnapshot({
      root,
      snapshot: { title: 'My deals', opml },
      parseOpml,
      loadOutline,
      setReadOnly,
      applyReadOnlyToolbar,
      applyDocumentTitle: (t) => {
        titled = t;
      },
      menubar: document.querySelector('.menubar'),
    });
    assert.equal(ok, true);
    assert.equal(isReadOnly(root), true);
    assert.match(titled, /My deals/);
    assert.match(titled, /\(PBN\)/);
    const items = [...root.querySelectorAll(':scope > [data-item]')];
    assert.equal(items[0].querySelector('.text')?.textContent, 'Intro');
    assert.ok(items[1].querySelector('.deal-diagram'));
    assert.equal(items[1].querySelector('.text'), null);
    assert.equal(document.getElementById('menu-render-pbn')?.disabled, false);
    assert.equal(document.getElementById('menu-clear')?.disabled, true);
    assert.equal(document.querySelector('[data-cloud-bar]')?.hidden, false);
    assert.equal(
      document.getElementById('cloud-status')?.textContent,
      READONLY_STATUS_LABEL,
    );
  });

  it('shows a missing-snapshot message when the key is gone', () => {
    applyMissingPbnRenderSnapshot({
      root,
      loadOutline,
      setReadOnly,
      applyReadOnlyToolbar,
      applyDocumentTitle: () => {},
      menubar: document.querySelector('.menubar'),
    });
    assert.equal(isReadOnly(root), true);
    assert.equal(
      getItemText(root.querySelector('[data-item]')),
      PBN_RENDER_MISSING_MESSAGE,
    );
  });
});
