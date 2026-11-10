import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  parseDealFromLine,
  buildDealDiagramElement,
  replaceDealLinesWithDiagrams,
  countDealLinesInRoot,
} from '../src/outliner/deal-diagram.js';
import {
  mountOutliner,
  getItemText,
  loadOutline,
  toOpml,
} from '../src/outliner/outliner.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const SAMPLE =
  '73.QJT.AQ54.T752 QT6.876.KJ9.AQ84 5.A95432.7632.K6 AKJ9842.K.T8.J93';

describe('parseDealFromLine', () => {
  it('parses a bare four-hand PBN deal as North-first', () => {
    const deal = parseDealFromLine(SAMPLE);
    assert.ok(deal);
    assert.deepEqual(deal.hands.N.spades, '73');
    assert.deepEqual(deal.hands.N.hearts, 'QJT');
    assert.deepEqual(deal.hands.E.spades, 'QT6');
    assert.deepEqual(deal.hands.S.hearts, 'A95432');
    assert.deepEqual(deal.hands.W.spades, 'AKJ9842');
  });

  it('parses N: prefix, quoted, and [Deal "…"] wrappers', () => {
    const variants = [
      `N:${SAMPLE}`,
      `"N:${SAMPLE}"`,
      `[Deal "N:${SAMPLE}"]`,
      `[deal "N:${SAMPLE}"]`,
    ];
    for (const line of variants) {
      const deal = parseDealFromLine(line);
      assert.ok(deal, `expected parse for ${line.slice(0, 24)}…`);
      assert.equal(deal.hands.N.diamonds, 'AQ54');
      assert.equal(deal.hands.W.clubs, 'J93');
    }
  });

  it('returns null for non-deal text', () => {
    assert.equal(parseDealFromLine('Just a normal headline'), null);
    assert.equal(parseDealFromLine('N:not-a-deal'), null);
    assert.equal(parseDealFromLine(''), null);
  });

  it('parses a deal embedded in the middle of a line', () => {
    const deal = parseDealFromLine(
      `Board 3 lead ♥A — N:${SAMPLE} — make 3NT`,
    );
    assert.ok(deal);
    assert.equal(deal.hands.N.spades, '73');
    assert.equal(deal.hands.W.clubs, 'J93');
  });

  it('parses a [Deal "…"] tag with surrounding prose', () => {
    const deal = parseDealFromLine(
      `See [Deal "N:${SAMPLE}"] in the bulletin`,
    );
    assert.ok(deal);
    assert.equal(deal.hands.E.hearts, '876');
  });

  it('treats - as a void suit', () => {
    const deal = parseDealFromLine(
      'N:-.AKQ.JT9.8765 AKQ.JT9.8765.- JT9.8765.-.AKQ 8765.-.AKQ.JT9',
    );
    assert.ok(deal);
    assert.equal(deal.hands.N.spades, '');
    assert.equal(deal.hands.E.clubs, '');
  });

  it('rotates hands when the first seat is not North', () => {
    const deal = parseDealFromLine(
      'W:AKJ9842.K.T8.J93 73.QJT.AQ54.T752 QT6.876.KJ9.AQ84 5.A95432.7632.K6',
    );
    assert.ok(deal);
    assert.equal(deal.hands.W.spades, 'AKJ9842');
    assert.equal(deal.hands.N.spades, '73');
    assert.equal(deal.hands.E.spades, 'QT6');
    assert.equal(deal.hands.S.spades, '5');
  });
});

describe('buildDealDiagramElement axis visibility', () => {
  /** @type {import('jsdom').JSDOM} */
  let dom;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><body></body>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
  });

  afterEach(() => {
    dom.window.close();
  });

  it('omits NS hands when only EW have cards', () => {
    const deal = parseDealFromLine(
      'N:-.-.-.- QT6.876.KJ9.AQ84 -.-.-.- AKJ9842.K.T8.J93',
    );
    assert.ok(deal);
    const el = buildDealDiagramElement(deal);
    assert.equal(el.querySelector('.deal-north'), null);
    assert.equal(el.querySelector('.deal-south'), null);
    assert.ok(el.querySelector('.deal-east'));
    assert.ok(el.querySelector('.deal-west'));
    assert.match(el.querySelector('.deal-east')?.textContent ?? '', /QT6/);
    assert.match(el.querySelector('.deal-west')?.textContent ?? '', /AKJ9842/);
  });

  it('omits EW hands when only NS have cards', () => {
    const deal = parseDealFromLine(
      'N:73.QJT.AQ54.T752 -.-.-.- 5.A95432.7632.K6 -.-.-.-',
    );
    assert.ok(deal);
    const el = buildDealDiagramElement(deal);
    assert.equal(el.querySelector('.deal-east'), null);
    assert.equal(el.querySelector('.deal-west'), null);
    assert.equal(el.querySelector('.deal-mid'), null);
    assert.ok(el.querySelector('.deal-north'));
    assert.ok(el.querySelector('.deal-south'));
    assert.match(el.querySelector('.deal-north')?.textContent ?? '', /73/);
    assert.match(el.querySelector('.deal-south')?.textContent ?? '', /A95432/);
  });

  it('parses ... as an empty hand for NS-only partial deals', () => {
    const deal = parseDealFromLine(
      'N:Q87.T8.AKJT64.J6 ... AKJT2.Q943..AK95 ...',
    );
    assert.ok(deal);
    assert.equal(deal.hands.N.spades, 'Q87');
    assert.equal(deal.hands.S.spades, 'AKJT2');
    assert.equal(deal.hands.S.diamonds, '');
    assert.equal(deal.hands.E.spades, '');
    assert.equal(deal.hands.W.spades, '');
  });

  it('stacks N and S in one column so they share a left edge', () => {
    const deal = parseDealFromLine(
      'N:Q87.T8.AKJT64.J6 ... AKJT2.Q943..AK95 ...',
    );
    assert.ok(deal);
    const el = buildDealDiagramElement(deal);
    const stack = el.querySelector('.deal-stack');
    assert.ok(stack);
    assert.equal(stack.contains(el.querySelector('.deal-north')), true);
    assert.equal(stack.contains(el.querySelector('.deal-south')), true);

    const full = parseDealFromLine(SAMPLE);
    assert.ok(full);
    const fullEl = buildDealDiagramElement(full);
    const fullStack = fullEl.querySelector('.deal-stack');
    assert.ok(fullStack);
    assert.equal(fullStack.contains(fullEl.querySelector('.deal-north')), true);
    assert.equal(fullStack.contains(fullEl.querySelector('.deal-south')), true);
    assert.equal(fullStack.contains(fullEl.querySelector('.deal-mid')), true);

    const css = readFileSync(join(repoRoot, 'styles.css'), 'utf8');
    assert.match(
      css,
      /\.deal-stack\s*\{[^}]*align-items\s*:\s*flex-start/s,
    );
    assert.match(
      css,
      /\.deal-diagram\s*\{[^}]*align-items\s*:\s*center/s,
    );
  });

  it('shows all four hands when every seat has cards', () => {
    const deal = parseDealFromLine(SAMPLE);
    assert.ok(deal);
    const el = buildDealDiagramElement(deal);
    assert.ok(el.querySelector('.deal-north'));
    assert.ok(el.querySelector('.deal-east'));
    assert.ok(el.querySelector('.deal-south'));
    assert.ok(el.querySelector('.deal-west'));
  });
});

describe('main outline has no live deal diagrams', () => {
  /** @type {import('jsdom').JSDOM} */
  let dom;
  /** @type {HTMLElement} */
  let root;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html><body>
      <ol class="outline" data-outline-root>
        <li data-item>
          <div class="row">
            <button type="button" class="toggle"></button>
            <div class="text" contenteditable="true">Alpha</div>
          </div>
        </li>
      </ol>
    </body>`);
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Node = dom.window.Node;
    globalThis.DOMParser = dom.window.DOMParser;
    globalThis.XMLSerializer = dom.window.XMLSerializer;
    root = document.querySelector('[data-outline-root]');
    mountOutliner(root);
  });

  afterEach(() => {
    dom.window.close();
  });

  it('does not insert diagram children when a line is a deal', async () => {
    const item = root.querySelector('[data-item]');
    const text = item.querySelector('.text');
    text.textContent = `[Deal "N:${SAMPLE}"]`;
    text.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }));
    await Promise.resolve();
    assert.equal(item.querySelector('[data-deal-diagram]'), null);
    assert.equal(item.querySelector('.deal-diagram'), null);
    assert.equal(getItemText(item), `[Deal "N:${SAMPLE}"]`);
  });

  it('does not rebuild diagrams after loadOutline', () => {
    loadOutline(root, {
      items: [{ text: SAMPLE, children: [{ text: 'note', children: [] }] }],
    });
    const item = root.querySelector('[data-item]');
    assert.equal(item.querySelector('.deal-diagram'), null);
    assert.equal(getItemText(item), SAMPLE);
    const note = item.querySelector(':scope > ol > [data-item]');
    assert.equal(getItemText(note), 'note');
  });
});

describe('replaceDealLinesWithDiagrams', () => {
  /** @type {import('jsdom').JSDOM} */
  let dom;
  /** @type {HTMLElement} */
  let root;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html><body>
      <ol class="outline" data-outline-root>
        <li data-item>
          <div class="row">
            <button type="button" class="toggle"></button>
            <div class="text" contenteditable="true">Alpha</div>
          </div>
        </li>
      </ol>
    </body>`);
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Node = dom.window.Node;
    root = document.querySelector('[data-outline-root]');
    mountOutliner(root, { bindEvents: false });
  });

  afterEach(() => {
    dom.window.close();
  });

  it('replaces deal line text in place with a compass diagram', () => {
    loadOutline(root, {
      items: [
        { text: 'Intro', children: [] },
        { text: `[Deal "N:${SAMPLE}"]`, children: [] },
      ],
    });
    assert.equal(countDealLinesInRoot(root), 1);
    assert.equal(replaceDealLinesWithDiagrams(root), 1);
    const items = [...root.querySelectorAll(':scope > [data-item]')];
    assert.equal(items[0].querySelector('.text')?.textContent, 'Intro');
    assert.equal(items[1].querySelector('.text'), null);
    const diagram = items[1].querySelector('.deal-diagram');
    assert.ok(diagram);
    assert.ok(diagram.querySelector('.deal-north'));
    assert.match(diagram.textContent, /♠/);
    assert.match(diagram.textContent, /♥/);
    assert.equal(items[1].querySelector(':scope > ol'), null);
  });

  it('replaces an embedded mid-line deal with a diagram and keeps surrounding text', () => {
    loadOutline(root, {
      items: [
        {
          text: `Lead ♥A — N:${SAMPLE} — make 3NT`,
          children: [],
        },
      ],
    });
    assert.equal(countDealLinesInRoot(root), 1);
    assert.equal(replaceDealLinesWithDiagrams(root), 1);
    const textEl = root.querySelector('[data-item] .text');
    assert.ok(textEl);
    assert.match(textEl.textContent, /^Lead ♥A — /);
    assert.match(textEl.textContent, / — make 3NT$/);
    assert.ok(textEl.querySelector('.deal-diagram'));
    assert.doesNotMatch(textEl.textContent, /73\.QJT/);
  });

  it('leaves non-deal lines alone', () => {
    loadOutline(root, {
      items: [{ text: 'Just a headline', children: [] }],
    });
    assert.equal(countDealLinesInRoot(root), 0);
    assert.equal(replaceDealLinesWithDiagrams(root), 0);
    assert.equal(getItemText(root.querySelector('[data-item]')), 'Just a headline');
  });

  it('OPML from the main outline still stores PBN text, not diagrams', () => {
    loadOutline(root, {
      items: [{ text: `N:${SAMPLE}`, children: [] }],
    });
    const opml = toOpml(root, { title: 'T' });
    assert.doesNotMatch(opml, /deal-diagram/);
    assert.match(opml, /N:73\.QJT/);
  });
});
