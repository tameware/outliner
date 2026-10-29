import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountOutliner, loadOutline, getItemText, serializeOutline } from '../outliner.js';
import {
  collectSearchableItems,
  findMatches,
  findNextIndex,
  applyReplaceInText,
  replaceMatch,
  replaceAllMatches,
  selectTextRange,
} from '../find-replace.js';

function setupDom() {
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <ol class="outline" data-outline-root></ol>
  </body>`, { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.HTMLElement = dom.window.HTMLElement;
  return dom;
}

describe('find-replace core', () => {
  /** @type {HTMLElement} */
  let root;

  beforeEach(() => {
    setupDom();
    root = document.querySelector('[data-outline-root]');
    mountOutliner(root);
    loadOutline(root, {
      items: [
        { text: 'Alpha bridge', children: [] },
        {
          text: 'Beta Bridge notes',
          children: [{ text: 'gamma bridge tip', children: [] }],
        },
        { text: 'Delta', children: [] },
      ],
    });
  });

  it('collects searchable items in document order', () => {
    const items = collectSearchableItems(root);
    assert.deepEqual(items.map(getItemText), [
      'Alpha bridge',
      'Beta Bridge notes',
      'gamma bridge tip',
      'Delta',
    ]);
  });

  it('finds literal case-insensitive matches by default', () => {
    const matches = findMatches(root, { find: 'bridge' });
    assert.equal(matches.length, 3);
    assert.deepEqual(
      matches.map((m) => ({ text: getItemText(m.item), start: m.start, end: m.end })),
      [
        { text: 'Alpha bridge', start: 6, end: 12 },
        { text: 'Beta Bridge notes', start: 5, end: 11 },
        { text: 'gamma bridge tip', start: 6, end: 12 },
      ],
    );
  });

  it('honors case-sensitive literal search', () => {
    const matches = findMatches(root, { find: 'Bridge', caseSensitive: true });
    assert.equal(matches.length, 1);
    assert.equal(getItemText(matches[0].item), 'Beta Bridge notes');
  });

  it('supports Grep regex matching', () => {
    const matches = findMatches(root, { find: 'Br\\w+', grep: true, caseSensitive: true });
    assert.deepEqual(
      matches.map((m) => getItemText(m.item).slice(m.start, m.end)),
      ['Bridge'],
    );
  });

  it('returns an empty list and error for invalid Grep patterns', () => {
    const result = findMatches(root, { find: '(', grep: true });
    assert.equal(result.length, 0);
    assert.ok(result.error);
  });

  it('findNextIndex wraps when wrapAround is true', () => {
    const matches = findMatches(root, { find: 'bridge' });
    assert.equal(findNextIndex(matches, 2, { direction: 1, wrapAround: true }), 0);
    assert.equal(findNextIndex(matches, 0, { direction: -1, wrapAround: true }), 2);
  });

  it('findNextIndex returns -1 when not wrapping past the ends', () => {
    const matches = findMatches(root, { find: 'bridge' });
    assert.equal(findNextIndex(matches, 2, { direction: 1, wrapAround: false }), -1);
    assert.equal(findNextIndex(matches, 0, { direction: -1, wrapAround: false }), -1);
  });

  it('applyReplaceInText supports Grep capture groups', () => {
    assert.equal(
      applyReplaceInText('AK of hearts', /of (\w+)/, 'in $1', { grep: true }),
      'AK in hearts',
    );
    assert.equal(applyReplaceInText('a$b', /\$/, '$$', { grep: true }), 'a$b');
  });

  it('replaceMatch updates one line and reselects nothing required of caller', () => {
    const matches = findMatches(root, { find: 'bridge' });
    const ok = replaceMatch(matches[0], 'river');
    assert.equal(ok, true);
    assert.equal(getItemText(matches[0].item), 'Alpha river');
  });

  it('replaceMatch expands !c !d !h !s in the replace string', () => {
    const matches = findMatches(root, { find: 'bridge' });
    assert.equal(replaceMatch(matches[0], 'lead !h'), true);
    assert.equal(getItemText(matches[0].item), 'Alpha lead ♥');
    const heart = matches[0].item.querySelector('.suit-red');
    assert.equal(heart?.textContent, '♥');
  });

  it('replaceAllMatches replaces every match', () => {
    const n = replaceAllMatches(root, { find: 'bridge', replace: 'X' });
    assert.equal(n, 3);
    assert.deepEqual(serializeOutline(root), [
      { text: 'Alpha X', children: [] },
      {
        text: 'Beta X notes',
        children: [{ text: 'gamma X tip', children: [] }],
      },
      { text: 'Delta', children: [] },
    ]);
  });

  it('replaceAllMatches expands suit bangs in the replace string', () => {
    const n = replaceAllMatches(root, { find: 'Delta', replace: '!c!d!h!s' });
    assert.equal(n, 1);
    const delta = [...root.querySelectorAll('[data-item]')].at(-1);
    assert.equal(getItemText(delta), '♣♦♥♠');
    const reds = [...delta.querySelectorAll('.suit-red')].map((el) => el.textContent);
    assert.deepEqual(reds, ['♦', '♥']);
  });

  it('selectTextRange selects the match inside the line', () => {
    const item = root.querySelector('[data-item]');
    const text = item.querySelector('.text');
    selectTextRange(text, 6, 12);
    const sel = window.getSelection();
    assert.ok(sel.rangeCount);
    assert.equal(sel.toString(), 'bridge');
    assert.equal(document.activeElement, text);
  });
});
