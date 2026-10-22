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
} from '../outliner.js';
import { createClearOutlineControl } from '../clear-outline-ui.js';
// clearOutline is both under test and injected into the control

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
  beforeEach(() => {
    setupDom();
    mountOutliner(document.querySelector('[data-outline-root]'));
  });

  it('clearOutline replaces content with one empty line and returns an OPML snapshot', () => {
    const root = document.querySelector('[data-outline-root]');
    const snapshot = clearOutline(root);
    assert.match(snapshot, /Alpha/);
    assert.match(snapshot, /Beta/);
    assert.deepEqual(getItemTexts(root), ['']);
  });

  it('Clear outline is undoable via the toolbar control', () => {
    const root = document.querySelector('[data-outline-root]');
    const button = document.getElementById('btn-clear');
    const control = createClearOutlineControl({
      getRoot: () => root,
      button,
      toOpml,
      parseOpml,
      loadOutline,
      clearOutline,
    });

    control.clearOrUndo();
    assert.equal(button.textContent, 'Undo clear');
    assert.deepEqual(getItemTexts(root), ['']);

    control.clearOrUndo();
    assert.equal(button.textContent, 'Clear outline');
    assert.deepEqual(getItemTexts(root), ['Alpha', 'Beta']);
  });
});
