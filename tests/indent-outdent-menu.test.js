import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  mountOutliner,
  serializeOutline,
  toOpml,
  parseOpml,
  loadOutline,
  clearOutline,
} from '../outliner.js';
import { createOutlineHistory } from '../clear-outline-ui.js';
import { mountIndentOutdentMenu } from '../indent-outdent-menu.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function setupDom(html) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`, {
    url: 'http://localhost/',
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.DOMParser = dom.window.DOMParser;
  return dom;
}

function fixture() {
  return `
    <nav class="menubar">
      <div class="menu" data-menu="edit">
        <button type="button" class="menu-label">Edit</button>
        <div class="menu-panel" role="menu">
          <button type="button" role="menuitem" id="menu-undo" disabled>Undo</button>
          <button type="button" role="menuitem" id="menu-redo" disabled>Redo</button>
          <button type="button" role="menuitem" id="menu-indent">Indent</button>
          <button type="button" role="menuitem" id="menu-outdent">Outdent</button>
        </div>
      </div>
    </nav>
    <ol class="outline" data-outline-root>
      <li data-item>
        <div class="row">
          <button type="button" class="toggle" aria-label="Toggle"></button>
          <div class="text" contenteditable="true">Alpha</div>
        </div>
        <ol>
          <li data-item>
            <div class="row">
              <button type="button" class="toggle" aria-label="Toggle"></button>
              <div class="text" contenteditable="true">Beta</div>
            </div>
            <ol>
              <li data-item>
                <div class="row">
                  <button type="button" class="toggle" aria-label="Toggle"></button>
                  <div class="text" contenteditable="true">Gamma</div>
                </div>
              </li>
            </ol>
          </li>
          <li data-item>
            <div class="row">
              <button type="button" class="toggle" aria-label="Toggle"></button>
              <div class="text" contenteditable="true">Delta</div>
            </div>
          </li>
        </ol>
      </li>
    </ol>
  `;
}

describe('Edit Indent / Outdent menu', () => {
  /** @type {ReturnType<typeof mountOutliner>} */
  let api;
  /** @type {HTMLElement} */
  let root;
  /** @type {ReturnType<typeof createOutlineHistory>} */
  let history;
  /** @type {HTMLButtonElement} */
  let undoBtn;

  beforeEach(() => {
    setupDom(fixture());
    api = mountOutliner(document.querySelector('[data-outline-root]'));
    root = api.root;
    undoBtn = document.getElementById('menu-undo');
    history = createOutlineHistory({
      getRoot: () => root,
      undoButton: undoBtn,
      redoButton: document.getElementById('menu-redo'),
      toOpml,
      parseOpml,
      loadOutline,
      clearOutline,
      getTitle: () => 'Outline',
    });
    mountIndentOutdentMenu({
      indentButton: document.getElementById('menu-indent'),
      outdentButton: document.getElementById('menu-outdent'),
      getActiveItem: () => api.getActiveItem(),
      runStructural: (mutate) => history.run(mutate),
      isReadOnly: () => root.dataset.readonly === 'true',
    });
  });

  it('Indent matches Tab (demote under previous sibling)', () => {
    const delta = [...root.querySelectorAll('[data-item]')].find(
      (el) => el.querySelector('.text')?.textContent === 'Delta',
    );
    delta.querySelector('.text').focus();
    document.getElementById('menu-indent').click();
    assert.deepEqual(serializeOutline(root), [
      {
        text: 'Alpha',
        children: [
          {
            text: 'Beta',
            children: [
              { text: 'Gamma', children: [] },
              { text: 'Delta', children: [] },
            ],
          },
        ],
      },
    ]);
  });

  it('Outdent matches Shift+Tab (promote to parent level)', () => {
    const gamma = [...root.querySelectorAll('[data-item]')].find(
      (el) => el.querySelector('.text')?.textContent === 'Gamma',
    );
    gamma.querySelector('.text').focus();
    document.getElementById('menu-outdent').click();
    assert.deepEqual(serializeOutline(root), [
      {
        text: 'Alpha',
        children: [
          { text: 'Beta', children: [] },
          { text: 'Gamma', children: [] },
          { text: 'Delta', children: [] },
        ],
      },
    ]);
  });

  it('pushes Indent onto the undo stack and restores on Undo', () => {
    const before = serializeOutline(root);
    const delta = [...root.querySelectorAll('[data-item]')].find(
      (el) => el.querySelector('.text')?.textContent === 'Delta',
    );
    delta.querySelector('.text').focus();
    document.getElementById('menu-indent').click();
    assert.equal(history.canUndo(), true);
    assert.equal(undoBtn.disabled, false);
    assert.equal(history.undo(), true);
    assert.deepEqual(serializeOutline(root), before);
    assert.equal(history.canUndo(), false);
  });

  it('undoes menu Indent via Cmd/Ctrl+Z even when focus left the outline (Edit menu)', () => {
    history.bindShortcuts(root);
    const before = serializeOutline(root);
    const delta = [...root.querySelectorAll('[data-item]')].find(
      (el) => el.querySelector('.text')?.textContent === 'Delta',
    );
    delta.querySelector('.text').focus();
    // Opening Edit moves focus to the menu label; menuitem mousedown keeps it there.
    document.querySelector('.menu-label').focus();
    document.getElementById('menu-indent').click();
    assert.notEqual(serializeOutline(root), before);
    assert.ok(!root.contains(document.activeElement));

    const event = new window.KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.activeElement.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(serializeOutline(root), before);
  });

  it('leaves Cmd/Ctrl+Z to the browser when focus is in a dialog text field', () => {
    history.bindShortcuts(root);
    const delta = [...root.querySelectorAll('[data-item]')].find(
      (el) => el.querySelector('.text')?.textContent === 'Delta',
    );
    delta.querySelector('.text').focus();
    document.getElementById('menu-indent').click();
    assert.equal(history.canUndo(), true);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const event = new window.KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(history.canUndo(), true);
  });

  it('pushes Outdent onto the undo stack and restores on Undo', () => {
    const before = serializeOutline(root);
    const gamma = [...root.querySelectorAll('[data-item]')].find(
      (el) => el.querySelector('.text')?.textContent === 'Gamma',
    );
    gamma.querySelector('.text').focus();
    document.getElementById('menu-outdent').click();
    assert.equal(history.canUndo(), true);
    assert.equal(undoBtn.disabled, false);
    assert.equal(history.undo(), true);
    assert.deepEqual(serializeOutline(root), before);
  });

  it('does not push undo when Indent is a no-op', () => {
    const alpha = root.querySelector('[data-item]');
    alpha.querySelector('.text').focus();
    document.getElementById('menu-indent').click();
    assert.equal(history.canUndo(), false);
    assert.equal(undoBtn.disabled, true);
  });

  it('does nothing while read-only', () => {
    root.dataset.readonly = 'true';
    const delta = [...root.querySelectorAll('[data-item]')].find(
      (el) => el.querySelector('.text')?.textContent === 'Delta',
    );
    delta.querySelector('.text').focus();
    const before = serializeOutline(root);
    document.getElementById('menu-indent').click();
    document.getElementById('menu-outdent').click();
    assert.equal(history.canUndo(), false);
    assert.deepEqual(serializeOutline(root), before);
  });
});

describe('index.html Edit menu Indent / Outdent', () => {
  it('lists Indent and Outdent in the Edit menu', () => {
    const html = readFileSync(join(repoRoot, 'index.html'), 'utf8');
    assert.match(html, /id="menu-indent"[^>]*>Indent</);
    assert.match(html, /id="menu-outdent"[^>]*>Outdent</);
    const editPanel = html.match(/data-menu="edit"[\s\S]*?data-menu="view"/)?.[0] ?? '';
    assert.match(editPanel, /menu-indent/);
    assert.match(editPanel, /menu-outdent/);
  });

  it('app mounts Indent / Outdent through outlineHistory.run (undo stack)', () => {
    const appJs = readFileSync(join(repoRoot, 'app.js'), 'utf8');
    assert.match(appJs, /mountIndentOutdentMenu/);
    assert.match(appJs, /menu-indent/);
    assert.match(appJs, /menu-outdent/);
    assert.match(
      appJs,
      /runStructural:\s*\(mutate\)\s*=>\s*outlineHistory\.run\(mutate\)/,
    );
  });
});
