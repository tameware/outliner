import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  mountOutliner,
  toggleItem,
  focusAdjacentItem,
  demoteItem,
  getItemText,
  toOpml,
} from '../outliner.js';
import { createDirtyTracker } from '../dirty-tracker.js';

describe('content dirty vs expand/navigate', () => {
  /** @type {HTMLOListElement} */
  let root;
  /** @type {ReturnType<typeof createDirtyTracker>} */
  let dirty;

  beforeEach(() => {
    const dom = new JSDOM(`<!DOCTYPE html><body>
      <ol data-outline-root>
        <li data-item data-state="expanded">
          <div class="row">
            <button type="button" class="toggle" aria-label="Toggle"></button>
            <div class="text" contenteditable="true">Alpha</div>
          </div>
          <ol>
            <li data-item data-state="expanded">
              <div class="row">
                <button type="button" class="toggle" aria-label="Toggle"></button>
                <div class="text" contenteditable="true">Beta</div>
              </div>
            </li>
          </ol>
        </li>
        <li data-item data-state="expanded">
          <div class="row">
            <button type="button" class="toggle" aria-label="Toggle"></button>
            <div class="text" contenteditable="true">Gamma</div>
          </div>
        </li>
      </ol>
    </body>`);
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    root = document.querySelector('[data-outline-root]');
    mountOutliner(root);
    dirty = createDirtyTracker({
      getContentSnapshot: () =>
        toOpml(root, { title: 'T', includeExpansionState: false }),
      getRevertSnapshot: () => toOpml(root, { title: 'T' }),
    });
  });

  it('does not dirty on collapse, expand, expand/collapse all, or adjacent navigation', () => {
    const alpha = root.querySelector('[data-item]');
    const gamma = [...root.querySelectorAll('[data-item]')].at(-1);
    const parents = () =>
      [...root.querySelectorAll('[data-item][data-has-children="true"]')];

    toggleItem(alpha);
    assert.equal(dirty.isDirty(), false);
    toggleItem(alpha);
    assert.equal(dirty.isDirty(), false);

    parents().forEach((item) => {
      if (item.dataset.state !== 'collapsed') toggleItem(item);
    });
    assert.equal(dirty.isDirty(), false);
    parents().forEach((item) => {
      if (item.dataset.state === 'collapsed') toggleItem(item);
    });
    assert.equal(dirty.isDirty(), false);

    focusAdjacentItem(alpha, 1);
    focusAdjacentItem(gamma, -1);
    assert.equal(dirty.isDirty(), false);
  });

  it('dirties when text changes and when indent level changes', () => {
    const alpha = root.querySelector('[data-item]');
    const gamma = [...root.querySelectorAll('[data-item]')].at(-1);
    alpha.querySelector('.text').textContent = 'Alpha edited';
    assert.equal(dirty.isDirty(), true);
    dirty.markClean();
    assert.equal(dirty.isDirty(), false);
    assert.equal(demoteItem(gamma), true);
    assert.equal(getItemText(gamma), 'Gamma');
    assert.equal(dirty.isDirty(), true);
  });

  it('keeps full OPML (with expansion) as the revert baseline', () => {
    const alpha = root.querySelector('[data-item]');
    toggleItem(alpha);
    dirty.markClean();
    assert.match(dirty.getBaseline(), /<expansionState><\/expansionState>/);
    assert.doesNotMatch(dirty.getBaseline(), /<expansionState>1</);
  });
});
