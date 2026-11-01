/**
 * Locks chrome menu/shortcut wiring extracted from app.js.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { bindOutlineChrome } from '../src/chrome/outline-chrome.js';
import {
  mountOutliner,
  loadOutline,
  toOpml,
  parseOpml,
  clearOutline,
} from '../src/outliner/outliner.js';
import { createOutlineHistory } from '../src/outliner/clear-outline-ui.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('outline chrome bindings', () => {
  it('lives in src/chrome/outline-chrome.js', async () => {
    await access(join(repoRoot, 'src/chrome/outline-chrome.js'));
  });

  it('is wired from app.js', () => {
    const appJs = readFileSync(join(repoRoot, 'src/app.js'), 'utf8');
    assert.match(appJs, /bindOutlineChrome/);
    assert.match(appJs, /from ['"]\.\/chrome\/outline-chrome\.js['"]/);
  });

  describe('behavior', () => {
    /** @type {ReturnType<typeof bindOutlineChrome>} */
    let chrome;
    /** @type {HTMLElement} */
    let root;
    /** @type {ReturnType<typeof createOutlineHistory>} */
    let history;
    let clearedLocal = 0;

    beforeEach(() => {
      const html = readFileSync(join(repoRoot, 'index.html'), 'utf8');
      const dom = new JSDOM(html, {
        url: 'http://localhost/',
        pretendToBeVisual: true,
      });
      globalThis.window = dom.window;
      globalThis.document = dom.window.document;
      globalThis.Node = dom.window.Node;
      globalThis.DOMParser = dom.window.DOMParser;
      globalThis.KeyboardEvent = dom.window.KeyboardEvent;
      root = document.querySelector('[data-outline-root]');
      history = createOutlineHistory({
        getRoot: () => root,
        button: document.getElementById('menu-clear'),
        undoButton: document.getElementById('menu-undo'),
        redoButton: document.getElementById('menu-redo'),
        toOpml,
        parseOpml,
        loadOutline,
        clearOutline,
        getTitle: () => 'Notes',
        setTitle: () => {},
      });
      mountOutliner(root, {
        bindEvents: true,
        runStructural: (mutate) => history.run(mutate),
      });
      loadOutline(root, {
        items: [
          { text: 'Parent', children: [{ text: 'Child', children: [] }] },
        ],
      });
      const api = {
        getActiveItem: () => root.querySelector('[data-item]'),
      };
      clearedLocal = 0;
      chrome = bindOutlineChrome({
        root,
        api,
        outlineHistory: history,
        dirty: {
          isDirty: () => false,
          getBaseline: () => toOpml(root, { title: 'Notes' }),
        },
        applyDocumentTitle: () => {},
        applyDocumentUpdated: () => {},
        syncDocumentTitles: () => {},
        parseOpml,
        loadOutline,
        clearLocalFileHandle: () => {
          clearedLocal += 1;
        },
        restoreOutlineFocus: () => {},
        syncCloudSaveState: () => {},
        beep: () => {},
      });
    });

    it('returns syncFocusMenus and syncRevert for session wiring', () => {
      assert.equal(typeof chrome.syncFocusMenus, 'function');
      assert.equal(typeof chrome.syncRevert, 'function');
      chrome.syncFocusMenus();
      chrome.syncRevert();
      assert.equal(document.getElementById('menu-unfocus')?.disabled, true);
    });

    it('Clear runs history.clear and clears the local file handle', () => {
      document.getElementById('menu-clear').click();
      assert.equal(clearedLocal, 1);
      assert.equal(root.querySelectorAll('[data-item]').length, 1);
      assert.equal(
        root.querySelector('[data-item] .text')?.textContent,
        '',
      );
    });

    it('Expand All opens collapsed parents', () => {
      const parent = root.querySelector('[data-item]');
      parent.dataset.state = 'collapsed';
      parent.querySelector(':scope > ol').hidden = true;
      document.getElementById('menu-expand-all').click();
      assert.equal(parent.dataset.state, 'expanded');
    });
  });
});
