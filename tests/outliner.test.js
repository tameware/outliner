import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  mountOutliner,
  getItemText,
  getItemTexts,
  isExpanded,
  hasChildren,
  toggleItem,
  addItemAfter,
  removeItem,
  demoteItem,
  promoteItem,
  serializeOutline,
} from '../outliner.js';

function setupDom(html) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`, {
    url: 'http://localhost/',
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  return dom;
}

function fixtureOutline() {
  return `
    <div id="app">
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
        <li data-item>
          <div class="row">
            <button type="button" class="toggle" aria-label="Toggle"></button>
            <div class="text" contenteditable="true">Epsilon</div>
          </div>
        </li>
      </ol>
    </div>
  `;
}

function childListOf(item) {
  return item.querySelector(':scope > ol');
}

describe('WYSIWYG HTML outliner', () => {
  let root;
  let items;
  let api;

  beforeEach(() => {
    setupDom(fixtureOutline());
    root = document.querySelector('[data-outline-root]');
    api = mountOutliner(root);
    items = [...root.querySelectorAll('[data-item]')];
  });

  it('marks parents as expandable and leaves as leaf', () => {
    assert.equal(hasChildren(items[0]), true); // Alpha
    assert.equal(hasChildren(items[1]), true); // Beta
    assert.equal(hasChildren(items[2]), false); // Gamma
    assert.equal(hasChildren(items[3]), false); // Delta
    assert.equal(hasChildren(items[4]), false); // Epsilon

    assert.equal(items[0].dataset.hasChildren, 'true');
    assert.equal(items[2].dataset.hasChildren, 'false');
  });

  it('starts expanded and can collapse then expand a section', () => {
    assert.equal(isExpanded(items[0]), true);
    assert.equal(childListOf(items[0]).hidden, false);

    toggleItem(items[0]);
    assert.equal(isExpanded(items[0]), false);
    assert.equal(childListOf(items[0]).hidden, true);

    toggleItem(items[0]);
    assert.equal(isExpanded(items[0]), true);
    assert.equal(childListOf(items[0]).hidden, false);
  });

  it('adds a sibling after the current item', () => {
    const created = addItemAfter(items[3]); // after Delta
    assert.ok(created);
    assert.equal(getItemText(created), '');
    assert.equal(items[3].nextElementSibling, created);
    assert.equal(created.parentElement, items[3].parentElement);
    assert.deepEqual(getItemTexts(root), [
      'Alpha',
      'Beta',
      'Gamma',
      'Delta',
      '',
      'Epsilon',
    ]);
  });

  it('removes an item and keeps siblings intact', () => {
    removeItem(items[3]); // Delta
    assert.deepEqual(getItemTexts(root), ['Alpha', 'Beta', 'Gamma', 'Epsilon']);
    assert.equal(root.querySelectorAll('[data-item]').length, 4);
  });

  it('demotes an item to become a child of the previous sibling', () => {
    demoteItem(items[3]); // Delta under Beta
    const beta = items[1];
    assert.equal(
      [...root.querySelectorAll('[data-item]')].find((el) => getItemText(el) === 'Delta')
        .parentElement.closest('[data-item]'),
      beta,
    );
    assert.equal(hasChildren(beta), true);
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
      { text: 'Epsilon', children: [] },
    ]);
  });

  it('cannot demote the first child of a list', () => {
    const before = serializeOutline(root);
    assert.equal(demoteItem(items[0]), false); // Alpha is first top-level
    assert.equal(demoteItem(items[1]), false); // Beta is first under Alpha
    assert.deepEqual(serializeOutline(root), before);
  });

  it('promotes an item out to the parent level', () => {
    promoteItem(items[2]); // Gamma
    assert.deepEqual(serializeOutline(root), [
      {
        text: 'Alpha',
        children: [
          { text: 'Beta', children: [] },
          { text: 'Gamma', children: [] },
          { text: 'Delta', children: [] },
        ],
      },
      { text: 'Epsilon', children: [] },
    ]);
  });

  it('when promoting, following siblings become children of the promoted item', () => {
    demoteItem(items[3]);
    const gamma = [...root.querySelectorAll('[data-item]')].find(
      (el) => getItemText(el) === 'Gamma',
    );
    promoteItem(gamma);
    assert.deepEqual(serializeOutline(root), [
      {
        text: 'Alpha',
        children: [
          { text: 'Beta', children: [] },
          {
            text: 'Gamma',
            children: [{ text: 'Delta', children: [] }],
          },
        ],
      },
      { text: 'Epsilon', children: [] },
    ]);
  });

  it('cannot promote a top-level item', () => {
    assert.equal(promoteItem(items[0]), false);
    assert.equal(promoteItem(items[4]), false);
  });

  it('keeps nested HTML outline structure after edits', () => {
    addItemAfter(items[4]);
    demoteItem([...root.querySelectorAll('[data-item]')][5]);
    assert.equal(root.matches('ol'), true);
    assert.equal(root.querySelectorAll(':scope > li').length, 2);
    assert.ok(root.querySelectorAll('ol ol').length > 0);
  });

  it('remembers the last focused item for toolbar actions', () => {
    const text = items[4].querySelector('.text');
    text.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
    // Simulate clicking a toolbar control outside the outline
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    assert.equal(api.getActiveItem(), items[4]);
  });

  it('remembers the item after a click even if focusin is unreliable', () => {
    items[4].querySelector('.text').dispatchEvent(
      new window.MouseEvent('click', { bubbles: true }),
    );
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    assert.equal(api.getActiveItem(), items[4]);
  });
});
