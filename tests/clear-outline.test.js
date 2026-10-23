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
