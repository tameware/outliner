import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  matchMoveUpDownShortcut,
  handleMoveUpDownShortcut,
} from '../move-up-down-keys.js';
import { mountMoveUpDownMenu } from '../move-up-down-menu.js';
import {
  mountOutliner,
  loadOutline,
  serializeOutline,
  toOpml,
  parseOpml,
  clearOutline,
} from '../outliner.js';
import { createOutlineHistory } from '../clear-outline-ui.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('move up/down shortcuts', () => {
  it('maps Cmd/Ctrl+ArrowUp to move up and Cmd/Ctrl+ArrowDown to move down', () => {
    assert.equal(
      matchMoveUpDownShortcut({ key: 'ArrowUp', metaKey: true }),
      'up',
    );
    assert.equal(
      matchMoveUpDownShortcut({ key: 'ArrowDown', metaKey: true }),
      'down',
    );
    assert.equal(
      matchMoveUpDownShortcut({ key: 'ArrowUp', ctrlKey: true }),
      'up',
    );
    assert.equal(
      matchMoveUpDownShortcut({ key: 'ArrowDown', ctrlKey: true }),
      'down',
    );
  });

  it('matches by code when key is platform-specific', () => {
    assert.equal(
      matchMoveUpDownShortcut({ key: 'Up', code: 'ArrowUp', metaKey: true }),
      'up',
    );
    assert.equal(
      matchMoveUpDownShortcut({
        key: 'Down',
        code: 'ArrowDown',
        ctrlKey: true,
      }),
      'down',
    );
  });

  it('ignores bare arrows, Option arrows, and Shift+Cmd chords', () => {
    assert.equal(matchMoveUpDownShortcut({ key: 'ArrowUp' }), null);
    assert.equal(
      matchMoveUpDownShortcut({ key: 'ArrowUp', altKey: true }),
      null,
    );
    assert.equal(
      matchMoveUpDownShortcut({
        key: 'ArrowUp',
        metaKey: true,
        shiftKey: true,
      }),
      null,
    );
    assert.equal(
      matchMoveUpDownShortcut({ key: 'u', altKey: true }),
      null,
    );
    assert.equal(
      matchMoveUpDownShortcut({ key: 'ArrowLeft', metaKey: true }),
      null,
    );
  });

  it('always prevents default for Cmd+ArrowUp', () => {
    const beeps = [];
    const event = {
      key: 'ArrowUp',
      metaKey: true,
      preventDefault() {
        event.prevented = true;
      },
      prevented: false,
    };
    const handled = handleMoveUpDownShortcut(event, {
      run: () => false,
      beep: () => beeps.push(1),
      isReadOnly: () => false,
    });
    assert.equal(handled, true);
    assert.equal(event.prevented, true);
    assert.equal(beeps.length, 1);
  });

  it('runs move down when possible without beeping', () => {
    const beeps = [];
    const runs = [];
    const event = {
      key: 'ArrowDown',
      metaKey: true,
      preventDefault() {
        event.prevented = true;
      },
      prevented: false,
    };
    handleMoveUpDownShortcut(event, {
      run: (action) => {
        runs.push(action);
        return true;
      },
      beep: () => beeps.push(1),
      isReadOnly: () => false,
    });
    assert.deepEqual(runs, ['down']);
    assert.equal(event.prevented, true);
    assert.equal(beeps.length, 0);
  });

  it('blocks the shortcut in read-only mode and beeps', () => {
    const beeps = [];
    const runs = [];
    const event = {
      key: 'ArrowUp',
      metaKey: true,
      preventDefault() {
        event.prevented = true;
      },
      prevented: false,
    };
    handleMoveUpDownShortcut(event, {
      run: (action) => {
        runs.push(action);
        return true;
      },
      beep: () => beeps.push(1),
      isReadOnly: () => true,
    });
    assert.equal(event.prevented, true);
    assert.deepEqual(runs, []);
    assert.equal(beeps.length, 1);
  });
});

describe('Edit Move Up / Move Down menu', () => {
  /** @type {HTMLElement} */
  let root;
  /** @type {ReturnType<typeof mountOutliner>} */
  let api;
  /** @type {ReturnType<typeof createOutlineHistory>} */
  let history;

  beforeEach(() => {
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body>
        <nav class="menubar">
          <div class="menu" data-menu="edit">
            <button type="button" class="menu-label">Edit</button>
            <div class="menu-panel" role="menu">
              <button type="button" role="menuitem" id="menu-move-up">Move Up</button>
              <button type="button" role="menuitem" id="menu-move-down">Move Down</button>
            </div>
          </div>
        </nav>
        <ol class="outline" data-outline-root>
          <li data-item>
            <div class="row"><div class="text" contenteditable="true">A</div></div>
            <ol>
              <li data-item>
                <div class="row"><div class="text" contenteditable="true">A1</div></div>
              </li>
              <li data-item>
                <div class="row"><div class="text" contenteditable="true">A2</div></div>
              </li>
            </ol>
          </li>
          <li data-item>
            <div class="row"><div class="text" contenteditable="true">B</div></div>
          </li>
        </ol>
      </body></html>`,
      { url: 'http://localhost/', pretendToBeVisual: true },
    );
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.DOMParser = dom.window.DOMParser;
    root = document.querySelector('[data-outline-root]');
    api = mountOutliner(root);
    history = createOutlineHistory({
      getRoot: () => root,
      toOpml,
      parseOpml,
      loadOutline,
      clearOutline,
      getTitle: () => 'Outline',
    });
    mountMoveUpDownMenu({
      upButton: document.getElementById('menu-move-up'),
      downButton: document.getElementById('menu-move-down'),
      getActiveItem: () => api.getActiveItem(),
      runStructural: (mutate) => history.run(mutate),
      isReadOnly: () => false,
    });
  });

  it('Move Down swaps the active heading with the next sibling and keeps children', () => {
    const a = root.querySelector('[data-item]');
    a.querySelector('.text').focus();
    document.getElementById('menu-move-down').click();
    assert.deepEqual(serializeOutline(root), [
      { text: 'B', children: [] },
      {
        text: 'A',
        children: [
          { text: 'A1', children: [] },
          { text: 'A2', children: [] },
        ],
      },
    ]);
  });

  it('Move Up undoes via the structural history stack', () => {
    const a = root.querySelector('[data-item]');
    a.querySelector('.text').focus();
    document.getElementById('menu-move-down').click();
    history.undo();
    assert.deepEqual(serializeOutline(root), [
      {
        text: 'A',
        children: [
          { text: 'A1', children: [] },
          { text: 'A2', children: [] },
        ],
      },
      { text: 'B', children: [] },
    ]);
  });
});

describe('index.html Edit menu Move Up / Move Down', () => {
  it('lists Move Up and Move Down with Cmd/Ctrl arrow shortcuts after Outdent', () => {
    const html = readFileSync(join(repoRoot, 'index.html'), 'utf8');
    const editPanel = html.match(/data-menu="edit"[\s\S]*?data-menu="view"/)?.[0] ?? '';
    assert.match(editPanel, /id="menu-move-up"[^>]*>\s*Move Up/);
    assert.match(editPanel, /id="menu-move-down"[^>]*>\s*Move Down/);
    assert.match(editPanel, /id="menu-move-up"[\s\S]*?data-keys="mod\+up"/);
    assert.match(editPanel, /id="menu-move-down"[\s\S]*?data-keys="mod\+down"/);
    assert.ok(editPanel.indexOf('menu-outdent') < editPanel.indexOf('menu-move-up'));
    assert.ok(editPanel.indexOf('menu-move-down') < editPanel.indexOf('menu-promote'));
  });

  it('wires move up/down menu and shortcuts from app.js', () => {
    const appJs = readFileSync(join(repoRoot, 'app.js'), 'utf8');
    assert.match(appJs, /mountMoveUpDownMenu/);
    assert.match(appJs, /handleMoveUpDownShortcut/);
    assert.match(appJs, /moveItemUp/);
    assert.match(appJs, /moveItemDown/);
  });
});
