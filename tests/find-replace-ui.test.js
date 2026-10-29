import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  mountOutliner,
  loadOutline,
  getItemTexts,
  toOpml,
  parseOpml,
  clearOutline,
} from '../outliner.js';
import { createOutlineHistory } from '../clear-outline-ui.js';
import { mountFindReplace } from '../find-replace-ui.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function setupDom() {
  const html = readFileSync(join(repoRoot, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.DOMParser = dom.window.DOMParser;
  const dialog = document.getElementById('find-replace-dialog');
  dialog.show = () => {
    dialog.setAttribute('open', '');
  };
  dialog.close = () => {
    dialog.removeAttribute('open');
  };
  return dom;
}

describe('Find & Replace UI', () => {
  /** @type {HTMLElement} */
  let root;
  /** @type {ReturnType<typeof createOutlineHistory>} */
  let history;
  /** @type {ReturnType<typeof mountFindReplace>} */
  let ui;

  beforeEach(() => {
    setupDom();
    root = document.querySelector('[data-outline-root]');
    history = createOutlineHistory({
      getRoot: () => root,
      toOpml,
      parseOpml,
      loadOutline,
      clearOutline,
      getTitle: () => 'Outline',
    });
    mountOutliner(root, {
      runStructural: (mutate) => history.run(mutate),
    });
    loadOutline(root, {
      items: [
        { text: 'Alpha bridge', children: [] },
        { text: 'Beta bridge', children: [] },
      ],
    });
    ui = mountFindReplace({
      dialog: document.getElementById('find-replace-dialog'),
      findButton: document.getElementById('menu-find'),
      replaceButton: document.getElementById('menu-replace'),
      getRoot: () => root,
      getActiveItem: () => root.querySelector('[data-item]'),
      runStructural: (mutate) => history.run(mutate),
      beep: () => {},
    });
  });

  it('opens the shared dialog from Find… focused on Find', () => {
    document.getElementById('menu-find').click();
    const dialog = document.getElementById('find-replace-dialog');
    assert.ok(dialog.hasAttribute('open'));
    assert.equal(document.activeElement, document.getElementById('find-replace-find'));
  });

  it('opens the shared dialog from Replace… focused on Replace', () => {
    document.getElementById('menu-replace').click();
    assert.ok(document.getElementById('find-replace-dialog').hasAttribute('open'));
    assert.equal(document.activeElement, document.getElementById('find-replace-replace'));
  });

  it('Find Next selects the next match in the outline', () => {
    document.getElementById('menu-find').click();
    document.getElementById('find-replace-find').value = 'bridge';
    assert.equal(ui.findNext(), true);
    assert.equal(window.getSelection().toString(), 'bridge');
    assert.match(document.getElementById('find-replace-status').textContent, /1 of 2/);
    assert.equal(ui.findNext(), true);
    assert.match(document.getElementById('find-replace-status').textContent, /2 of 2/);
  });

  it('Replace All is undoable via outline history', () => {
    document.getElementById('menu-replace').click();
    document.getElementById('find-replace-find').value = 'bridge';
    document.getElementById('find-replace-replace').value = 'river';
    assert.equal(ui.replaceAll(), true);
    assert.deepEqual(getItemTexts(root), ['Alpha river', 'Beta river']);
    assert.equal(history.undo(), true);
    assert.deepEqual(getItemTexts(root), ['Alpha bridge', 'Beta bridge']);
  });

  it('Grep mode uses regex for Find Next', () => {
    document.getElementById('menu-find').click();
    document.getElementById('find-replace-find').value = 'B\\w+';
    document.getElementById('find-replace-grep').checked = true;
    document.getElementById('find-replace-case').checked = true;
    assert.equal(ui.findNext(), true);
    assert.equal(window.getSelection().toString(), 'Beta');
  });

  it('expands !h in the Replace field while typing', () => {
    document.getElementById('menu-replace').click();
    const input = document.getElementById('find-replace-replace');
    input.value = 'AK!';
    input.selectionStart = 3;
    input.selectionEnd = 3;
    input.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'h',
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(input.value, 'AK♥');
  });
});

describe('index.html Find & Replace menu', () => {
  it('lists Find… and Replace… in the Edit menu above Clear', () => {
    const html = readFileSync(join(repoRoot, 'index.html'), 'utf8');
    assert.match(html, /id="menu-find"/);
    assert.match(html, /id="menu-replace"/);
    assert.match(html, /id="find-replace-dialog"/);
    assert.match(html, /id="find-replace-grep"/);
    assert.ok(html.indexOf('id="menu-find"') < html.indexOf('id="menu-clear"'));
    assert.ok(html.indexOf('id="menu-replace"') < html.indexOf('id="menu-clear"'));
  });

  it('wires mountFindReplace from app.js', () => {
    const appJs = readFileSync(join(repoRoot, 'app.js'), 'utf8');
    assert.match(appJs, /mountFindReplace/);
    assert.match(appJs, /find-replace-dialog/);
  });

  it('keeps the Find panel above the outline with fixed stacking', () => {
    const css = readFileSync(join(repoRoot, 'styles.css'), 'utf8');
    assert.match(css, /\.find-replace-dialog\s*\{[^}]*position\s*:\s*fixed/s);
    assert.match(css, /\.find-replace-dialog\s*\{[^}]*z-index\s*:\s*\d+/s);
  });
});
