import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  mountOutliner,
  toOpml,
  parseOpml,
  loadOutline,
  getItemTexts,
} from '../outliner.js';
import { createOutlineHistory } from '../clear-outline-ui.js';
import { createDirtyTracker } from '../dirty-tracker.js';
import {
  revertToCleanSnapshot,
  syncRevertMenuItem,
} from '../revert-outline.js';

describe('revert outline', () => {
  /** @type {HTMLElement} */
  let root;
  /** @type {ReturnType<typeof createOutlineHistory>} */
  let history;
  /** @type {ReturnType<typeof createDirtyTracker>} */
  let dirty;
  let title;

  beforeEach(() => {
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
      <button type="button" id="menu-revert" disabled>Revert</button>
    </body>`, { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.DOMParser = dom.window.DOMParser;
    root = document.querySelector('[data-outline-root]');
    mountOutliner(root);
    title = 'Demo';
    history = createOutlineHistory({
      getRoot: () => root,
      toOpml,
      parseOpml,
      loadOutline,
      getTitle: () => title,
    });
    dirty = createDirtyTracker({
      getSnapshot: () => toOpml(root, { title }),
    });
  });

  it('does nothing when the outline is already clean', () => {
    assert.equal(
      revertToCleanSnapshot({
        isDirty: () => dirty.isDirty(),
        getBaseline: () => dirty.getBaseline(),
        getRoot: () => root,
        parseOpml,
        loadOutline,
        setTitle: (t) => {
          title = t;
        },
        run: (mutate) => history.run(mutate),
      }),
      false,
    );
    assert.equal(history.canUndo(), false);
  });

  it('restores the clean snapshot and can be undone', () => {
    root.querySelector('.text').textContent = 'Changed';
    assert.equal(dirty.isDirty(), true);

    assert.equal(
      revertToCleanSnapshot({
        isDirty: () => dirty.isDirty(),
        getBaseline: () => dirty.getBaseline(),
        getRoot: () => root,
        parseOpml,
        loadOutline,
        setTitle: (t) => {
          title = t;
        },
        run: (mutate) => history.run(mutate),
      }),
      true,
    );
    assert.deepEqual(getItemTexts(root), ['Alpha', 'Beta']);
    assert.equal(dirty.isDirty(), false);
    assert.equal(history.canUndo(), true);

    assert.equal(history.undo(), true);
    assert.equal(root.querySelector('.text').textContent, 'Changed');
    assert.equal(dirty.isDirty(), true);
  });

  it('syncRevertMenuItem disables when clean and enables when dirty', () => {
    const btn = document.getElementById('menu-revert');
    syncRevertMenuItem(btn, () => dirty.isDirty());
    assert.equal(btn.disabled, true);
    root.querySelector('.text').textContent = 'X';
    syncRevertMenuItem(btn, () => dirty.isDirty());
    assert.equal(btn.disabled, false);
  });
});
