/**
 * Boots src/app.js against index.html in JSDOM so composition wiring is
 * checked behaviorally instead of by grepping app.js source text.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('app.js smoke boot', () => {
  /** @type {Window & typeof globalThis} */
  let window;
  /** @type {Document} */
  let document;

  before(async () => {
    const html = readFileSync(join(repoRoot, 'index.html'), 'utf8');
    const dom = new JSDOM(html, {
      url: 'http://localhost/',
      pretendToBeVisual: true,
      runScripts: 'outside-only',
    });
    window = dom.window;
    document = window.document;

    // jsdom lacks HTMLDialogElement show/close used by Find & Replace.
    const findDialog = document.getElementById('find-replace-dialog');
    if (findDialog) {
      findDialog.show = () => {
        findDialog.setAttribute('open', '');
      };
      findDialog.close = () => {
        findDialog.removeAttribute('open');
      };
    }
    const unsaved = document.getElementById('unsaved-dialog');
    if (unsaved) {
      unsaved.show = () => unsaved.setAttribute('open', '');
      unsaved.close = () => unsaved.removeAttribute('open');
      unsaved.showModal = unsaved.show;
    }

    globalThis.window = window;
    globalThis.document = document;
    globalThis.Node = window.Node;
    globalThis.DOMParser = window.DOMParser;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.DocumentFragment = window.DocumentFragment;
    globalThis.CustomEvent = window.CustomEvent;
    globalThis.Event = window.Event;
    globalThis.KeyboardEvent = window.KeyboardEvent;
    globalThis.MouseEvent = window.MouseEvent;
    globalThis.NodeFilter = window.NodeFilter;
    globalThis.getComputedStyle = window.getComputedStyle.bind(window);
    globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
    globalThis.history = window.history;
    globalThis.localStorage = window.localStorage;
    globalThis.alert = () => {};
    globalThis.confirm = () => true;
    Object.defineProperty(globalThis, 'location', {
      value: window.location,
      configurable: true,
    });

    await import(pathToFileURL(join(repoRoot, 'src/app.js')).href);
    // Allow bootCloud()'s async IIFE to settle (config is null → null cloud).
    await new Promise((r) => setTimeout(r, 30));
  });

  it('mounts the starter outline and exposes the outliner API', () => {
    assert.ok(window.__outlinerApi);
    assert.ok(window.__outlinerApi.root);
    const items = document.querySelectorAll('[data-item]');
    assert.ok(items.length > 1, 'expected starter outline items');
    // Single top-level "How to use…" parent → openDepth 1 expands it.
    const top = document.querySelector('[data-outline-root] > [data-item]');
    assert.ok(top);
    assert.match(top.querySelector('.text')?.textContent ?? '', /How to use this outliner/);
    assert.equal(top.dataset.state, 'expanded');
    assert.equal(
      document.getElementById('document-title')?.textContent,
      'Getting Started',
    );
    assert.match(document.title, /^Getting Started/);
  });

  it('fills menu shortcut labels on boot', () => {
    const undoShortcut = document.querySelector('#menu-undo .menu-shortcut');
    assert.ok(undoShortcut);
    assert.notEqual(undoShortcut.textContent.trim(), '');
  });

  it('binds File Open / Save / Save As / Insert menu actions', () => {
    for (const id of [
      'menu-file-open',
      'menu-file-save',
      'menu-file-save-as',
      'menu-insert-import',
    ]) {
      assert.ok(document.getElementById(id), id);
    }
    const fileInput = document.getElementById('file-open');
    let openClicks = 0;
    fileInput.addEventListener('click', (event) => {
      event.preventDefault();
      openClicks += 1;
    });
    // No File System Access API in jsdom → legacy input path.
    document.getElementById('menu-file-open').click();
    assert.equal(openClicks, 1);
    document.getElementById('menu-insert-import').click();
    assert.equal(openClicks, 2);
  });

  it('binds Focus / Unfocus and move / indent menus', () => {
    for (const id of [
      'menu-focus',
      'menu-unfocus',
      'menu-move-up',
      'menu-move-down',
      'menu-indent',
      'menu-outdent',
    ]) {
      assert.ok(document.getElementById(id), id);
    }
  });

  it('mounts Find & Replace and opens it from Edit → Find…', () => {
    const dialog = document.getElementById('find-replace-dialog');
    assert.ok(dialog);
    assert.equal(dialog.hasAttribute('open'), false);
    document.getElementById('menu-find').click();
    assert.equal(dialog.hasAttribute('open'), true);
    dialog.close();
    assert.equal(dialog.hasAttribute('open'), false);
  });

  it('keeps the document title editor in sync with the tab title', () => {
    const titleEl = document.getElementById('document-title');
    assert.ok(titleEl);
    titleEl.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    assert.equal(titleEl.getAttribute('contenteditable') !== 'false', true);
    titleEl.textContent = 'Smoke Notes';
    titleEl.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.match(document.title, /Smoke Notes/);
  });

  it('wires beforeunload against dirty state', () => {
    const item = document.querySelector('[data-item] .text');
    assert.ok(item);
    item.textContent = `edited for dirty check ${Date.now()}`;
    const event = new window.Event('beforeunload', { cancelable: true });
    Object.defineProperty(event, 'returnValue', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    window.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.returnValue, '');
  });

  it('wires File and Cloud Revert to the same enabled/disabled state', () => {
    const fileRevert = document.getElementById('menu-revert');
    const cloudRevert = document.getElementById('menu-cloud-revert');
    assert.ok(fileRevert);
    assert.ok(cloudRevert);
    assert.equal(fileRevert.disabled, cloudRevert.disabled);
  });

  it('mounts the Outliner menu (Help / About remain available)', () => {
    assert.ok(document.getElementById('menu-help'));
    assert.ok(document.getElementById('menu-about'));
  });
});
