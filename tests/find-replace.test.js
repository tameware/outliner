import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  mountOutliner,
  loadOutline,
  getItemText,
  serializeOutline,
  isExpanded,
} from '../outliner.js';
import {
  collectSearchableItems,
  findMatches,
  findNextIndex,
  applyReplaceInText,
  expandReplaceTemplate,
  replaceMatch,
  replaceAllMatches,
  selectTextRange,
  expandCollapsedAncestors,
} from '../find-replace.js';
import { syncDealDiagram } from '../deal-diagram.js';

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

  it('whole-word literal search skips substrings inside longer words', () => {
    loadOutline(root, {
      items: [
        { text: 'cat catalog catch cat', children: [] },
        { text: 'concatenate', children: [] },
      ],
    });
    const loose = findMatches(root, { find: 'cat' });
    assert.equal(loose.length, 5);
    const whole = findMatches(root, { find: 'cat', wholeWord: true });
    assert.deepEqual(
      whole.map((m) => ({ text: getItemText(m.item), start: m.start, end: m.end })),
      [
        { text: 'cat catalog catch cat', start: 0, end: 3 },
        { text: 'cat catalog catch cat', start: 18, end: 21 },
      ],
    );
  });

  it('whole-word works with case-sensitive and Grep modes', () => {
    loadOutline(root, {
      items: [{ text: 'Bridge bridges Bridge', children: [] }],
    });
    const matches = findMatches(root, {
      find: 'Bridge',
      wholeWord: true,
      caseSensitive: true,
    });
    assert.equal(matches.length, 2);
    assert.deepEqual(
      matches.map((m) => [m.start, m.end]),
      [
        [0, 6],
        [15, 21],
      ],
    );

    loadOutline(root, {
      items: [{ text: 'cat catalog cat', children: [] }],
    });
    assert.equal(findMatches(root, { find: 'cat', grep: true }).length, 3);
    const grep = findMatches(root, {
      find: 'cat',
      grep: true,
      wholeWord: true,
    });
    assert.deepEqual(
      grep.map((m) => [m.start, m.end]),
      [
        [0, 3],
        [12, 15],
      ],
    );
  });

  it('replaceAllMatches respects wholeWord', () => {
    loadOutline(root, {
      items: [{ text: 'cat catalog cat', children: [] }],
    });
    const count = replaceAllMatches(root, {
      find: 'cat',
      replace: 'dog',
      wholeWord: true,
    });
    assert.equal(count, 2);
    assert.equal(getItemText(root.querySelector('[data-item]')), 'dog catalog dog');
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

  it('skips Focus-hidden lines when collecting searchable items', () => {
    const alpha = root.querySelector('[data-item]');
    const beta = alpha.nextElementSibling;
    beta.dataset.focusRole = 'hidden';
    const items = collectSearchableItems(root);
    assert.ok(items.includes(alpha));
    assert.ok(!items.includes(beta));
    const matches = findMatches(root, { find: 'bridge' });
    assert.equal(matches.length, 2);
  });

  it('skips Focus ancestor rows so Find cannot select invisible parents', () => {
    const alpha = root.querySelector('[data-item]');
    alpha.dataset.focusRole = 'ancestor';
    const items = collectSearchableItems(root);
    assert.ok(!items.includes(alpha));
    assert.equal(findMatches(root, { find: 'Alpha' }).length, 0);
  });

  it('expands unmatched Grep capture groups to an empty string', () => {
    assert.equal(
      expandReplaceTemplate('$1', { 0: 'dog', 1: undefined, 2: 'dog', length: 3 }, { grep: true }),
      '',
    );
    assert.equal(
      applyReplaceInText('dog', /(cat)|(dog)/, '$1', { grep: true }),
      '',
    );
    assert.equal(
      expandReplaceTemplate('$9', { 0: 'dog', length: 1 }, { grep: true }),
      '$9',
    );
  });

  it('replaceMatch refuses stale offsets that no longer hold the match text', () => {
    const matches = findMatches(root, { find: 'bridge' });
    const stale = { ...matches[0], start: 0, end: 5, matchText: 'bridge' };
    assert.equal(replaceMatch(stale, 'river', { find: 'bridge' }), false);
    assert.equal(getItemText(matches[0].item), 'Alpha bridge');
  });

  it('replaceMatch Grep lookaround uses full-line context for $1', () => {
    loadOutline(root, { items: [{ text: 'cat dog', children: [] }] });
    const item = root.querySelector('[data-item]');
    const match = {
      item,
      start: 4,
      end: 7,
      matchText: 'dog',
    };
    assert.equal(
      replaceMatch(match, '$1!', {
        grep: true,
        find: '(?<=cat )(dog)',
      }),
      true,
    );
    assert.equal(getItemText(item), 'cat dog!');
  });

  it('replaceMatch expands !c !d !h !s in the replace string', () => {
    const matches = findMatches(root, { find: 'bridge' });
    assert.equal(replaceMatch(matches[0], 'lead !h'), true);
    assert.equal(getItemText(matches[0].item), 'Alpha lead ♥');
    const heart = matches[0].item.querySelector('.suit-red');
    assert.equal(heart?.textContent, '♥');
  });

  it('replaceMatch refreshes a deal diagram after changing the deal source line', () => {
    const deal =
      'N:73.QJT.AQ54.T752 QT6.876.KJ9.AQ84 5.A95432.7632.K6 AKJ9842.K.T8.J93';
    loadOutline(root, { items: [{ text: deal, children: [] }] });
    const item = root.querySelector('[data-item]');
    assert.equal(syncDealDiagram(item), true);
    assert.ok(item.querySelector('[data-deal-diagram]'));
    const matches = findMatches(root, { find: 'QT6' });
    assert.equal(replaceMatch(matches[0], 'AJT'), true);
    assert.match(getItemText(item), /AJT/);
    assert.ok(item.querySelector('[data-deal-diagram]'), 'diagram stays attached');
    assert.doesNotMatch(
      item.querySelector('[data-deal-diagram]')?.textContent ?? '',
      /QT6/,
    );
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

  it('expandCollapsedAncestors expands every collapsed parent of the item', () => {
    loadOutline(root, {
      items: [
        {
          text: 'Parent',
          expanded: false,
          children: [
            {
              text: 'Child',
              expanded: false,
              children: [{ text: 'needle here', children: [] }],
            },
          ],
        },
      ],
    });
    const parent = root.querySelector('[data-item]');
    const child = parent.querySelector('[data-item]');
    const needle = child.querySelector('[data-item]');
    assert.equal(isExpanded(parent), false);
    assert.equal(isExpanded(child), false);

    assert.equal(expandCollapsedAncestors(needle, root), true);
    assert.equal(isExpanded(parent), true);
    assert.equal(isExpanded(child), true);
    assert.equal(expandCollapsedAncestors(needle, root), false);
  });
});
