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
  addItemAfter,
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

  it('keeps the Clear outline control usable after clear', () => {
    const button = document.getElementById('btn-clear');
    history.clear();
    assert.ok(button);
    assert.deepEqual(getItemTexts(root), ['']);
  });

  it('undoes clear via undo() (Edit menu / Cmd-Z path)', () => {
    history.clear();
    assert.deepEqual(getItemTexts(root), ['']);
    assert.equal(history.undo(), true);
    assert.deepEqual(getItemTexts(root), ['Alpha', 'Beta']);
  });

  it('notifies onChange after run, undo, and redo', () => {
    const calls = [];
    history = createOutlineHistory({
      getRoot: () => root,
      toOpml,
      parseOpml,
      loadOutline,
      clearOutline,
      getTitle: () => 'Outline',
      onChange: () => calls.push('change'),
    });
    assert.equal(calls.length, 0);
    history.run(() => {
      promoteChildren(root.querySelector('[data-item]'));
      return true;
    });
    assert.equal(calls.length, 1);
    history.undo();
    assert.equal(calls.length, 2);
    history.redo();
    assert.equal(calls.length, 3);
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

  it('enables Undo after typing and undoes the whole typing burst', () => {
    const undoBtn = document.createElement('button');
    document.body.append(undoBtn);
    history = createOutlineHistory({
      getRoot: () => root,
      toOpml,
      parseOpml,
      loadOutline,
      clearOutline,
      getTitle: () => 'Outline',
      undoButton: undoBtn,
    });
    history.bindShortcuts(root);
    const text = root.querySelector('.text');
    text.focus();
    const before = getItemTexts(root);

    text.dispatchEvent(
      new window.InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: 'x',
      }),
    );
    text.textContent = `x${text.textContent}`;
    assert.equal(history.canUndo(), true);
    assert.equal(undoBtn.disabled, false);

    text.dispatchEvent(
      new window.InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: 'y',
      }),
    );
    text.textContent = `y${text.textContent}`;
    assert.equal(history.undoDepth(), 1, 'coalesce one burst into one undo entry');

    assert.equal(history.undo(), true);
    assert.deepEqual(getItemTexts(root), before);
    assert.equal(undoBtn.disabled, true);
  });

  it('starts a new undo entry after blur between typing bursts', () => {
    history = createOutlineHistory({
      getRoot: () => root,
      toOpml,
      parseOpml,
      loadOutline,
      clearOutline,
      getTitle: () => 'Outline',
    });
    history.bindShortcuts(root);
    const text = root.querySelector('.text');
    text.focus();
    text.dispatchEvent(
      new window.InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: 'a',
      }),
    );
    text.blur();
    text.focus();
    text.dispatchEvent(
      new window.InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: 'b',
      }),
    );
    assert.equal(history.undoDepth(), 2);
  });

  it('enables Undo from input events when beforeinput does not fire', () => {
    const undoBtn = document.createElement('button');
    document.body.append(undoBtn);
    history = createOutlineHistory({
      getRoot: () => root,
      toOpml,
      parseOpml,
      loadOutline,
      clearOutline,
      getTitle: () => 'Outline',
      undoButton: undoBtn,
    });
    history.bindShortcuts(root);
    const text = root.querySelector('.text');
    text.focus();
    const before = getItemTexts(root);

    // Some environments (incl. Chromium embed) emit input without beforeinput.
    text.textContent = `Z${text.textContent}`;
    text.dispatchEvent(
      new window.InputEvent('input', {
        bubbles: true,
        cancelable: false,
        inputType: 'insertText',
        data: 'Z',
      }),
    );
    assert.equal(history.canUndo(), true);
    assert.equal(undoBtn.disabled, false);
    assert.equal(history.undo(), true);
    assert.deepEqual(getItemTexts(root), before);
  });

  it('undoes unrecorded typing after Enter before undoing the new line', () => {
    loadOutline(root, { items: [{ text: 'Alpha', children: [] }] });
    history = createOutlineHistory({
      getRoot: () => root,
      toOpml,
      parseOpml,
      loadOutline,
      clearOutline,
      getTitle: () => 'Outline',
    });
    history.bindShortcuts(root);
    const first = root.querySelector('[data-item]');
    history.run(() => {
      addItemAfter(first, '');
      return true;
    });
    assert.deepEqual(getItemTexts(root), ['Alpha', '']);
    assert.equal(history.undoDepth(), 1);

    // Typing that never emits beforeinput/input (IME/embeds) must not be wiped
    // together with the structural Enter step on the first Cmd+Z.
    const newLine = [...root.querySelectorAll('[data-item] .text')][1];
    newLine.textContent = 'hello';
    assert.deepEqual(getItemTexts(root), ['Alpha', 'hello']);

    assert.equal(history.undo(), true);
    assert.deepEqual(getItemTexts(root), ['Alpha', '']);
    assert.equal(history.undoDepth(), 1, 'Enter remains undoable');

    assert.equal(history.undo(), true);
    assert.deepEqual(getItemTexts(root), ['Alpha']);
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

describe('undo/redo preserves focus', () => {
  let root;
  let history;

  function placeCaret(el, offset) {
    el.focus();
    const range = document.createRange();
    const node = el.firstChild || el;
    range.setStart(node, Math.min(offset, node.textContent?.length ?? 0));
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function caretOffset() {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    return sel.getRangeAt(0).startOffset;
  }

  function focusedText() {
    const el = document.activeElement;
    return el?.classList?.contains('text') ? el.textContent : null;
  }

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
  });

  it('keeps focus and caret after undoing Tab indent', () => {
    loadOutline(root, {
      items: [
        { text: 'A', children: [] },
        { text: 'B', children: [] },
      ],
    });
    const bText = [...root.querySelectorAll('[data-item]')][1].querySelector('.text');
    placeCaret(bText, 1);
    history.run(() => demoteItem([...root.querySelectorAll('[data-item]')][1]));
    assert.equal(focusedText(), 'B');
    assert.equal(caretOffset(), 1);

    history.undo();
    assert.equal(focusedText(), 'B');
    assert.equal(caretOffset(), 1);
    assert.equal(
      root.querySelector('[data-item]').querySelector(':scope > ol > [data-item]'),
      null,
    );
  });

  it('keeps focus and caret after undoing Shift+Tab outdent', () => {
    loadOutline(root, {
      items: [
        {
          text: 'A',
          children: [{ text: 'Hello', children: [] }],
        },
      ],
    });
    const child = root.querySelector('[data-item] [data-item]');
    const text = child.querySelector('.text');
    placeCaret(text, 2);
    history.run(() => promoteItem(child));
    assert.equal(focusedText(), 'Hello');
    assert.equal(caretOffset(), 2);

    history.undo();
    assert.equal(focusedText(), 'Hello');
    assert.equal(caretOffset(), 2);
  });

  it('keeps focus and caret after undoing toolbar Promote', () => {
    loadOutline(root, {
      items: [
        {
          text: 'Parent',
          children: [{ text: 'Kid', children: [] }],
        },
      ],
    });
    const parent = root.querySelector('[data-item]');
    const text = parent.querySelector('.text');
    placeCaret(text, 3);
    history.run(() => promoteChildren(parent));
    history.undo();
    assert.equal(focusedText(), 'Parent');
    assert.equal(caretOffset(), 3);
  });

  it('keeps focus and caret after redoing a structural edit', () => {
    loadOutline(root, {
      items: [
        { text: 'A', children: [] },
        { text: 'B', children: [] },
      ],
    });
    const b = [...root.querySelectorAll('[data-item]')][1];
    placeCaret(b.querySelector('.text'), 1);
    history.run(() => demoteItem(b));
    history.undo();
    history.redo();
    assert.equal(focusedText(), 'B');
    assert.equal(caretOffset(), 1);
    assert.ok(
      root.querySelector('[data-item]').querySelector(':scope > ol > [data-item]'),
    );
  });

  it('undoes Enter (add line) and returns focus to the previous line', () => {
    loadOutline(root, {
      items: [
        { text: 'A', children: [] },
        { text: 'B', children: [] },
      ],
    });
    const a = root.querySelector('[data-item]');
    const aText = a.querySelector('.text');
    placeCaret(aText, 1);
    aText.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.deepEqual(getItemTexts(root), ['A', '', 'B']);
    assert.equal(focusedText(), '');

    history.undo();
    assert.deepEqual(getItemTexts(root), ['A', 'B']);
    assert.equal(focusedText(), 'A');
    assert.equal(caretOffset(), 1);
  });

  it('keeps red hearts and diamonds after undoing an inserted line', () => {
    loadOutline(root, {
      items: [
        { text: 'Lead ♥', children: [] },
        { text: 'Discard ♦', children: [] },
      ],
    });
    const lines = [...root.querySelectorAll('[data-item] .text')];
    assert.equal(lines[0].querySelector('.suit-red')?.textContent, '♥');
    assert.equal(lines[1].querySelector('.suit-red')?.textContent, '♦');

    const first = root.querySelector('[data-item]');
    placeCaret(first.querySelector('.text'), 1);
    first.querySelector('.text').dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.deepEqual(getItemTexts(root), ['Lead ♥', '', 'Discard ♦']);

    history.undo();
    assert.deepEqual(getItemTexts(root), ['Lead ♥', 'Discard ♦']);
    const restored = [...root.querySelectorAll('[data-item] .text')];
    assert.equal(restored[0].querySelector('.suit-red')?.textContent, '♥');
    assert.equal(restored[1].querySelector('.suit-red')?.textContent, '♦');
  });
});
