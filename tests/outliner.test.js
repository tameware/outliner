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
  addItemBelow,
  removeItem,
  demoteItem,
  promoteItem,
  promoteChildren,
  demoteFollowingSiblings,
  serializeOutline,
  setReadOnly,
  isReadOnly,
  loadOutline,
  focusSameLevelSibling,
  focusAdjacentItem,
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

function directFirstChild(item) {
  const list = childListOf(item);
  return list?.querySelector(':scope > [data-item]') ?? null;
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

  it('addItemBelow inserts a same-level sibling when the line has no children', () => {
    const created = addItemBelow(items[3]); // Delta is a leaf
    assert.equal(items[3].nextElementSibling, created);
    assert.equal(created.parentElement, items[3].parentElement);
    assert.deepEqual(serializeOutline(root), [
      {
        text: 'Alpha',
        children: [
          {
            text: 'Beta',
            children: [{ text: 'Gamma', children: [] }],
          },
          { text: 'Delta', children: [] },
          { text: '', children: [] },
        ],
      },
      { text: 'Epsilon', children: [] },
    ]);
  });

  it('addItemBelow inserts as the first child when the line has subheads', () => {
    const created = addItemBelow(items[0]); // Alpha has children
    assert.equal(created.parentElement.closest('[data-item]'), items[0]);
    assert.equal(directFirstChild(items[0]), created);
    assert.deepEqual(serializeOutline(root), [
      {
        text: 'Alpha',
        children: [
          { text: '', children: [] },
          {
            text: 'Beta',
            children: [{ text: 'Gamma', children: [] }],
          },
          { text: 'Delta', children: [] },
        ],
      },
      { text: 'Epsilon', children: [] },
    ]);
  });

  it('addItemBelow expands a collapsed parent when inserting the first subhead', () => {
    toggleItem(items[0]);
    assert.equal(isExpanded(items[0]), false);
    const created = addItemBelow(items[0]);
    assert.equal(isExpanded(items[0]), true);
    assert.equal(directFirstChild(items[0]), created);
    assert.equal(childListOf(items[0]).hidden, false);
  });

  it('Enter key uses addItemBelow (first child under a parent)', () => {
    const alphaText = items[0].querySelector('.text');
    alphaText.focus();
    alphaText.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(directFirstChild(items[0]), document.activeElement.closest('[data-item]'));
    assert.equal(getItemText(document.activeElement.closest('[data-item]')), '');
  });

  it('Backspace on an empty first child returns focus to the end of the parent', () => {
    const alpha = items[0];
    const alphaText = alpha.querySelector('.text');
    alphaText.focus();
    alphaText.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );
    const created = document.activeElement.closest('[data-item]');
    assert.equal(getItemText(created), '');
    assert.equal(created.previousElementSibling, null);

    document.activeElement.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Backspace',
        bubbles: true,
        cancelable: true,
      }),
    );

    assert.equal(document.activeElement.closest('[data-item]'), alpha);
    assert.equal(getItemText(alpha), 'Alpha');
    // Caret at end of the parent (where Enter started).
    const sel = window.getSelection();
    assert.ok(sel.rangeCount);
    const range = sel.getRangeAt(0);
    assert.equal(range.collapsed, true);
    const pre = range.cloneRange();
    pre.selectNodeContents(alphaText);
    pre.setEnd(range.startContainer, range.startOffset);
    assert.equal(pre.toString(), 'Alpha');
    assert.equal(directFirstChild(alpha)?.querySelector('.text')?.textContent, 'Beta');
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

  it('toolbar promote lifts children to become siblings of the selected item', () => {
    // Alpha has Beta (with Gamma) and Delta — promote on Alpha lifts Beta and Delta.
    assert.equal(promoteChildren(items[0]), true);
    assert.deepEqual(serializeOutline(root), [
      { text: 'Alpha', children: [] },
      {
        text: 'Beta',
        children: [{ text: 'Gamma', children: [] }],
      },
      { text: 'Delta', children: [] },
      { text: 'Epsilon', children: [] },
    ]);
  });

  it('toolbar promote does nothing when the item has no children', () => {
    assert.equal(promoteChildren(items[4]), false); // Epsilon
    assert.deepEqual(getItemTexts(root), ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']);
  });

  it('toolbar demote pulls following same-level siblings under the selected item', () => {
    // Demote on Beta: Delta (same level under Alpha) becomes a child of Beta.
    assert.equal(demoteFollowingSiblings(items[1]), true);
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

  it('toolbar demote does nothing when there are no following siblings', () => {
    assert.equal(demoteFollowingSiblings(items[3]), false); // Delta is last under Alpha
    assert.equal(demoteFollowingSiblings(items[4]), false); // Epsilon is last top-level
  });

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
    if (!sel || !sel.rangeCount) return null;
    return sel.getRangeAt(0).startOffset;
  }

  it('Tab demote does not move focus or caret', () => {
    const delta = items[3];
    const text = delta.querySelector('.text');
    placeCaret(text, 2);
    assert.equal(demoteItem(delta), true);
    assert.equal(document.activeElement, text);
    assert.equal(caretOffset(), 2);
  });

  it('Shift+Tab promote does not move focus or caret', () => {
    const gamma = items[2];
    const text = gamma.querySelector('.text');
    placeCaret(text, 1);
    assert.equal(promoteItem(gamma), true);
    assert.equal(document.activeElement, text);
    assert.equal(caretOffset(), 1);
  });

  it('toolbar Promote does not move focus or caret', () => {
    const alpha = items[0];
    const text = alpha.querySelector('.text');
    placeCaret(text, 3);
    assert.equal(promoteChildren(alpha), true);
    assert.equal(document.activeElement, text);
    assert.equal(caretOffset(), 3);
  });

  it('toolbar Demote does not move focus or caret', () => {
    const beta = items[1];
    const text = beta.querySelector('.text');
    placeCaret(text, 2);
    assert.equal(demoteFollowingSiblings(beta), true);
    assert.equal(document.activeElement, text);
    assert.equal(caretOffset(), 2);
  });

  it('focusSameLevelSibling moves to the next headline at the same level', () => {
    // Beta and Delta are siblings under Alpha; Gamma is a child of Beta.
    assert.equal(focusSameLevelSibling(items[1], 'down'), true); // Beta → Delta
    assert.equal(document.activeElement, items[3].querySelector('.text'));
    assert.equal(getItemText(items[3]), 'Delta');
  });

  it('focusSameLevelSibling moves to the previous headline at the same level', () => {
    assert.equal(focusSameLevelSibling(items[3], 'up'), true); // Delta → Beta
    assert.equal(document.activeElement, items[1].querySelector('.text'));
    assert.equal(getItemText(items[1]), 'Beta');
  });

  it('focusSameLevelSibling skips nested children', () => {
    // From Alpha, down goes to Epsilon (top-level), not into Beta.
    assert.equal(focusSameLevelSibling(items[0], 'down'), true);
    assert.equal(document.activeElement, items[4].querySelector('.text'));
    assert.equal(getItemText(items[4]), 'Epsilon');
  });

  it('focusSameLevelSibling does nothing at the edge of a list', () => {
    assert.equal(focusSameLevelSibling(items[0], 'up'), false);
    assert.equal(focusSameLevelSibling(items[4], 'down'), false);
    assert.equal(focusSameLevelSibling(items[2], 'up'), false); // Gamma is only child under Beta
  });

  it('focusAdjacentItem moves to the next visible line regardless of level', () => {
    // Alpha → Beta → Gamma → Delta → Epsilon in document order.
    assert.equal(focusAdjacentItem(items[0], 'down'), true); // Alpha → Beta
    assert.equal(getItemText(document.activeElement.closest('[data-item]')), 'Beta');
    assert.equal(focusAdjacentItem(items[1], 'down'), true); // Beta → Gamma
    assert.equal(getItemText(document.activeElement.closest('[data-item]')), 'Gamma');
    assert.equal(focusAdjacentItem(items[2], 'down'), true); // Gamma → Delta
    assert.equal(getItemText(document.activeElement.closest('[data-item]')), 'Delta');
  });

  it('focusAdjacentItem moves to the previous visible line regardless of level', () => {
    assert.equal(focusAdjacentItem(items[3], 'up'), true); // Delta → Gamma
    assert.equal(getItemText(document.activeElement.closest('[data-item]')), 'Gamma');
    assert.equal(focusAdjacentItem(items[2], 'up'), true); // Gamma → Beta
    assert.equal(getItemText(document.activeElement.closest('[data-item]')), 'Beta');
  });

  it('focusAdjacentItem skips lines under a collapsed parent', () => {
    toggleItem(items[1]); // collapse Beta (hides Gamma)
    assert.equal(isExpanded(items[1]), false);
    assert.equal(focusAdjacentItem(items[1], 'down'), true); // Beta → Delta (skip Gamma)
    assert.equal(getItemText(document.activeElement.closest('[data-item]')), 'Delta');
  });

  it('focusAdjacentItem does nothing at the outline edges', () => {
    assert.equal(focusAdjacentItem(items[0], 'up'), false);
    assert.equal(focusAdjacentItem(items[4], 'down'), false);
  });

  it('ArrowUp/ArrowDown keydown move to adjacent lines', () => {
    const betaText = items[1].querySelector('.text');
    betaText.focus();
    betaText.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(getItemText(document.activeElement.closest('[data-item]')), 'Gamma');

    document.activeElement.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'ArrowUp',
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(getItemText(document.activeElement.closest('[data-item]')), 'Beta');
  });

  it('Option/Alt+ArrowUp/ArrowDown keydown move same-level focus', () => {
    const betaText = items[1].querySelector('.text');
    betaText.focus();
    const down = new window.KeyboardEvent('keydown', {
      key: 'ArrowDown',
      code: 'ArrowDown',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    betaText.dispatchEvent(down);
    assert.equal(down.defaultPrevented, true);
    assert.equal(getItemText(document.activeElement.closest('[data-item]')), 'Delta');

    const up = new window.KeyboardEvent('keydown', {
      key: 'ArrowUp',
      code: 'ArrowUp',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.activeElement.dispatchEvent(up);
    assert.equal(up.defaultPrevented, true);
    assert.equal(getItemText(document.activeElement.closest('[data-item]')), 'Beta');
  });

  it('Option/Alt+ArrowDown uses activeElement when the event is dispatched on document', () => {
    const betaText = items[1].querySelector('.text');
    betaText.focus();
    const down = new window.KeyboardEvent('keydown', {
      key: 'ArrowDown',
      code: 'ArrowDown',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(down);
    assert.equal(down.defaultPrevented, true);
    assert.equal(getItemText(document.activeElement.closest('[data-item]')), 'Delta');
  });

  it('Option/Alt+ArrowDown reaches the next same-depth line under a following parent', () => {
    // Gamma is the last child under Beta; next same-depth line is none in the
    // default fixture — extend Delta with a child so Option+↓ from Gamma can move.
    loadOutline(root, {
      items: [
        {
          text: 'Alpha',
          children: [
            {
              text: 'Beta',
              children: [{ text: 'Gamma', children: [] }],
            },
            {
              text: 'Delta',
              children: [{ text: 'Foxtrot', children: [] }],
            },
          ],
        },
      ],
    });
    const all = [...root.querySelectorAll('[data-item]')];
    const gamma = all.find((el) => getItemText(el) === 'Gamma');
    const foxtrot = all.find((el) => getItemText(el) === 'Foxtrot');
    gamma.querySelector('.text').focus();
    // DOM nextElementSibling is null; same-depth navigation should still find Foxtrot.
    assert.equal(gamma.nextElementSibling, null);
    assert.equal(focusSameLevelSibling(gamma, 'down'), true);
    assert.equal(document.activeElement.closest('[data-item]'), foxtrot);

    const ev = new window.KeyboardEvent('keydown', {
      key: 'ArrowDown',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    // Reset and verify keydown path.
    gamma.querySelector('.text').focus();
    gamma.querySelector('.text').dispatchEvent(ev);
    assert.equal(ev.defaultPrevented, true);
    assert.equal(getItemText(document.activeElement.closest('[data-item]')), 'Foxtrot');
  });

  it('Option/Alt+ArrowDown falls back to the next line when no same-depth target exists', () => {
    // Delta is the last depth-1 child under Alpha; next visible line is Epsilon (depth 0).
    // Option+↑ still finds Beta — the classic “↑ works, ↓ doesn’t” spot without fallback.
    const deltaText = items[3].querySelector('.text');
    deltaText.focus();
    assert.equal(focusSameLevelSibling(items[3], 'down'), false);

    const down = new window.KeyboardEvent('keydown', {
      key: 'ArrowDown',
      code: 'ArrowDown',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    deltaText.dispatchEvent(down);
    assert.equal(down.defaultPrevented, true);
    assert.equal(getItemText(document.activeElement.closest('[data-item]')), 'Epsilon');
  });

  it('Shift+ArrowDown does not move same-level focus (left to contenteditable selection)', () => {
    const betaText = items[1].querySelector('.text');
    betaText.focus();
    const down = new window.KeyboardEvent('keydown', {
      key: 'ArrowDown',
      code: 'ArrowDown',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    betaText.dispatchEvent(down);
    assert.equal(down.defaultPrevented, false);
    assert.equal(getItemText(document.activeElement.closest('[data-item]')), 'Beta');
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

  it('setReadOnly disables contenteditable on all item text', () => {
    const root = document.querySelector('[data-outline-root]');
    setReadOnly(root, true);
    assert.equal(isReadOnly(root), true);
    root.querySelectorAll('.text').forEach((el) => {
      assert.equal(el.contentEditable, 'false');
    });
    setReadOnly(root, false);
    assert.equal(isReadOnly(root), false);
    root.querySelectorAll('.text').forEach((el) => {
      assert.equal(el.contentEditable, 'true');
    });
  });

  it('loadOutline preserves read-only mode', () => {
    const root = document.querySelector('[data-outline-root]');
    setReadOnly(root, true);
    loadOutline(root, { items: [{ text: 'Only', children: [] }] });
    assert.equal(isReadOnly(root), true);
    assert.equal(root.querySelector('.text').contentEditable, 'false');
  });
});
