import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  mountOutliner,
  getItemTexts,
  clearOutline,
  loadOutline,
  parseOpml,
  toOpml,
  promoteChildren,
  demoteFollowingSiblings,
  demoteItem,
  promoteItem,
} from '../outliner.js';
import { createOutlineHistory } from '../clear-outline-ui.js';

function setupDom() {
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <ol class="outline" data-outline-root>
      <li data-item data-state="expanded">
        <div class="row">
          <button type="button" class="toggle"></button>
          <div class="text" contenteditable="true">Alpha</div>
        </div>
        <ol>
          <li data-item>
            <div class="row">
              <button type="button" class="toggle"></button>
              <div class="text" contenteditable="true">Beta</div>
            </div>
          </li>
        </ol>
      </li>
    </ol>
    <button type="button" id="btn-clear">Clear outline</button>
  </body>`);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.Node = dom.window.Node;
  return dom;
}

describe('clear outline', () => {
  let root;
  let history;

  beforeEach(() => {
    setupDom();
    root = document.querySelector('[data-outline-root]');
    mountOutliner(root);
    history = createOutlineHistory({
      getRoot: () => root,
      toOpml,
      parseOpml,
      loadOutline,
      clearOutline,
      getTitle: () => 'Outline',
    });
  });

  it('clearOutline replaces content with one empty line and returns an OPML snapshot', () => {
    const snapshot = clearOutline(root);
    assert.match(snapshot, /Alpha/);
    assert.match(snapshot, /Beta/);
    assert.deepEqual(getItemTexts(root), ['']);
  });

  it('keeps the Clear outline button label unchanged after clear', () => {
    const button = document.getElementById('btn-clear');
    history.clear();
    assert.equal(button.textContent, 'Clear outline');
    assert.deepEqual(getItemTexts(root), ['']);
  });

  it('undoes clear via undo() (Edit menu / Cmd-Z path)', () => {
    history.clear();
    assert.deepEqual(getItemTexts(root), ['']);
    assert.equal(history.undo(), true);
    assert.deepEqual(getItemTexts(root), ['Alpha', 'Beta']);
  });

  it('handles Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z shortcuts', () => {
    history.bindShortcuts(root);
    history.clear();

    root.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'z',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.deepEqual(getItemTexts(root), ['Alpha', 'Beta']);

    root.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'z',
        metaKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.deepEqual(getItemTexts(root), ['']);
  });

  it('handles beforeinput historyUndo from the Edit menu', () => {
    history.bindShortcuts(root);
    history.clear();

    const event = new window.InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'historyUndo',
    });
    root.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(getItemTexts(root), ['Alpha', 'Beta']);
  });

  it('undoes promote after record() via Edit menu / Cmd-Z', () => {
    history.bindShortcuts(root);
    const alpha = root.querySelector('[data-item]');
    history.record();
    assert.equal(promoteChildren(alpha), true);
    assert.equal(
      root.querySelector('[data-item]').querySelector(':scope > ol > [data-item]'),
      null,
    );

    const event = new window.InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'historyUndo',
    });
    root.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.ok(
      root.querySelector('[data-item]').querySelector(':scope > ol > [data-item]'),
    );
  });

  it('undoes demote after record() via Cmd/Ctrl+Z', () => {
    history.bindShortcuts(root);
    loadOutline(root, {
      items: [
        { text: 'A', children: [] },
        { text: 'B', children: [] },
      ],
    });
    const a = root.querySelector('[data-item]');
    history.record();
    assert.equal(demoteFollowingSiblings(a), true);
    assert.deepEqual(getItemTexts(root), ['A', 'B']);
    assert.ok(
      root.querySelector('[data-item]').querySelector(':scope > ol > [data-item]'),
    );

    root.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'z',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.deepEqual(getItemTexts(root), ['A', 'B']);
    assert.equal(
      root.querySelector('[data-item]').querySelector(':scope > ol > [data-item]'),
      null,
    );
  });

  it('run() records only when the mutation succeeds', () => {
    const alpha = root.querySelector('[data-item]');
    assert.equal(
      history.run(() => promoteChildren(alpha)),
      true,
    );
    assert.equal(history.canUndo(), true);

    // Epsilon-style: leaf with no children → promote fails, no undo entry added.
    history.discard();
    loadOutline(root, { items: [{ text: 'Leaf', children: [] }] });
    const leaf = root.querySelector('[data-item]');
    assert.equal(
      history.run(() => promoteChildren(leaf)),
      false,
    );
    assert.equal(history.canUndo(), false);
  });
});

describe('multi-step undo/redo stack', () => {
  let root;
  let history;

  beforeEach(() => {
    setupDom();
    root = document.querySelector('[data-outline-root]');
    mountOutliner(root);
    history = createOutlineHistory({
      getRoot: () => root,
      toOpml,
      parseOpml,
      loadOutline,
      clearOutline,
      getTitle: () => 'Outline',
      maxDepth: 50,
    });
  });

  it('undoes and redoes several structural edits in order', () => {
    loadOutline(root, {
      items: [
        { text: 'A', children: [] },
        { text: 'B', children: [] },
        { text: 'C', children: [] },
      ],
    });

    // 1) demote B under A
    history.run(() => demoteItem([...root.querySelectorAll('[data-item]')][1]));
    // 2) demote C under A (as sibling of B under A) — C is last top-level after step 1
    history.run(() => demoteItem([...root.querySelectorAll(':scope > [data-item]')][1]));
    // 3) clear
    history.clear();
    assert.deepEqual(getItemTexts(root), ['']);
    assert.equal(history.undoDepth(), 3);
    assert.equal(history.redoDepth(), 0);

    assert.equal(history.undo(), true); // undo clear → A with B,C children
    assert.ok(getItemTexts(root).includes('A'));
    assert.notDeepEqual(getItemTexts(root), ['']);
    assert.equal(history.undoDepth(), 2);
    assert.equal(history.redoDepth(), 1);

    assert.equal(history.undo(), true);
    assert.equal(history.undo(), true);
    assert.deepEqual(getItemTexts(root), ['A', 'B', 'C']);
    assert.equal(
      root.querySelector(':scope > [data-item]')?.querySelector(':scope > ol > [data-item]'),
      null,
    );
    assert.equal(history.canUndo(), false);
    assert.equal(history.redoDepth(), 3);

    assert.equal(history.redo(), true);
    assert.equal(history.redo(), true);
    assert.equal(history.redo(), true);
    assert.deepEqual(getItemTexts(root), ['']);
    assert.equal(history.canRedo(), false);
  });

  it('drops the oldest entries when maxDepth is exceeded', () => {
    history = createOutlineHistory({
      getRoot: () => root,
      toOpml,
      parseOpml,
      loadOutline,
      clearOutline,
      getTitle: () => 'Outline',
      maxDepth: 2,
    });
    loadOutline(root, {
      items: [
        { text: 'A', children: [] },
        { text: 'B', children: [] },
      ],
    });
    history.run(() => demoteItem([...root.querySelectorAll('[data-item]')][1]));
    history.clear();
    history.clear(); // third entry — should drop the first
    assert.equal(history.undoDepth(), 2);

    history.undo(); // undo second clear
    history.undo(); // undo first clear → still demoted, cannot reach pre-demote
    assert.equal(history.canUndo(), false);
    assert.ok(
      root.querySelector('[data-item]')?.querySelector(':scope > ol > [data-item]'),
    );
  });

  it('clears the redo stack after a new edit following undo', () => {
    loadOutline(root, {
      items: [
        { text: 'A', children: [] },
        { text: 'B', children: [] },
      ],
    });
    history.run(() => demoteItem([...root.querySelectorAll('[data-item]')][1]));
    history.clear();
    history.undo();
    assert.equal(history.canRedo(), true);
    history.run(() => promoteChildren(root.querySelector('[data-item]')));
    assert.equal(history.canRedo(), false);
  });

  it('redoes via Ctrl/Cmd+Y as well as Shift+Cmd/Ctrl+Z', () => {
    history.bindShortcuts(root);
    history.clear();
    history.undo();

    root.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'y',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.deepEqual(getItemTexts(root), ['']);
  });

  it('updates Undo/Redo buttons when the stacks change', () => {
    const undoBtn = document.createElement('button');
    undoBtn.id = 'btn-undo';
    const redoBtn = document.createElement('button');
    redoBtn.id = 'btn-redo';
    document.body.append(undoBtn, redoBtn);
    history = createOutlineHistory({
      getRoot: () => root,
      toOpml,
      parseOpml,
      loadOutline,
      clearOutline,
      getTitle: () => 'Outline',
      undoButton: undoBtn,
      redoButton: redoBtn,
    });
    assert.equal(undoBtn.disabled, true);
    assert.equal(redoBtn.disabled, true);
    history.clear();
    assert.equal(undoBtn.disabled, false);
    assert.equal(redoBtn.disabled, true);
    history.undo();
    assert.equal(undoBtn.disabled, true);
    assert.equal(redoBtn.disabled, false);
  });
});

describe('Tab / Shift+Tab undo', () => {
  let root;
  let history;

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
    history.bindShortcuts(root);
  });

  it('undoes Tab indent via Edit menu historyUndo', () => {
    loadOutline(root, {
      items: [
        { text: 'A', children: [] },
        { text: 'B', children: [] },
      ],
    });
    const b = [...root.querySelectorAll('[data-item]')][1];
    const text = b.querySelector('.text');
    text.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.ok(
      root.querySelector('[data-item]').querySelector(':scope > ol > [data-item]'),
    );

    const event = new window.InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'historyUndo',
    });
    root.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(
      root.querySelector('[data-item]').querySelector(':scope > ol > [data-item]'),
      null,
    );
    assert.deepEqual(getItemTexts(root), ['A', 'B']);
  });

  it('undoes Shift+Tab outdent via Cmd/Ctrl+Z', () => {
    loadOutline(root, {
      items: [
        {
          text: 'A',
          children: [{ text: 'B', children: [] }],
        },
      ],
    });
    const b = root.querySelector('[data-item] [data-item]');
    b.querySelector('.text').dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(
      root.querySelector('[data-item]').querySelector(':scope > ol > [data-item]'),
      null,
    );
    assert.deepEqual(getItemTexts(root), ['A', 'B']);

    root.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'z',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.ok(
      root.querySelector('[data-item]').querySelector(':scope > ol > [data-item]'),
    );
    assert.deepEqual(getItemTexts(root), ['A', 'B']);
  });

  it('does not push undo when Tab indent is a no-op', () => {
    loadOutline(root, { items: [{ text: 'Only', children: [] }] });
    const only = root.querySelector('[data-item]');
    only.querySelector('.text').dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(history.canUndo(), false);
    // Sanity: direct demote of first item is also a no-op
    assert.equal(demoteItem(only), false);
    assert.equal(promoteItem(only), false);
  });
});
