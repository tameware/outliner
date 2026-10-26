import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  parseDealFromLine,
  syncDealDiagram,
  isDealDiagramItem,
} from '../deal-diagram.js';
import {
  mountOutliner,
  getItemText,
  serializeOutline,
  loadOutline,
  toOpml,
  parseOpml,
} from '../outliner.js';

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

  it('treats - as a void suit', () => {
    const deal = parseDealFromLine(
      'N:-.AKQ.JT9.8765 AKQ.JT9.8765.- JT9.8765.-.AKQ 8765.-.AKQ.JT9',
    );
    assert.ok(deal);
    assert.equal(deal.hands.N.spades, '');
    assert.equal(deal.hands.E.clubs, '');
  });

  it('rotates hands when the first seat is not North', () => {
    // W-first listing: West, North, East, South
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

describe('syncDealDiagram', () => {
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

  it('inserts a non-editable diagram child under a deal line', () => {
    const item = root.querySelector('[data-item]');
    item.querySelector('.text').textContent = `[Deal "N:${SAMPLE}"]`;
    assert.equal(syncDealDiagram(item), true);
    const kids = [...item.querySelectorAll(':scope > ol > [data-item]')];
    assert.equal(kids.length, 1);
    assert.equal(isDealDiagramItem(kids[0]), true);
    assert.ok(kids[0].querySelector('.deal-diagram'));
    assert.ok(kids[0].querySelector('.deal-north'));
    assert.ok(kids[0].querySelector('.suit-red'));
    assert.match(kids[0].textContent, /♠/);
    assert.match(kids[0].textContent, /♥/);
    assert.equal(kids[0].querySelector('.text'), null);
  });

  it('removes the diagram when the line is no longer a deal', () => {
    const item = root.querySelector('[data-item]');
    item.querySelector('.text').textContent = SAMPLE;
    syncDealDiagram(item);
    item.querySelector('.text').textContent = 'Not a deal anymore';
    assert.equal(syncDealDiagram(item), false);
    assert.equal(item.querySelector('[data-deal-diagram]'), null);
  });

  it('omits diagram children from serializeOutline and OPML', () => {
    const item = root.querySelector('[data-item]');
    item.querySelector('.text').textContent = `N:${SAMPLE}`;
    syncDealDiagram(item);
    assert.deepEqual(serializeOutline(root), [
      { text: `N:${SAMPLE}`, children: [] },
    ]);
    const opml = toOpml(root, { title: 'T' });
    assert.doesNotMatch(opml, /deal-diagram/);
    assert.match(opml, /N:73\.QJT/);
  });

  it('rebuilds diagrams after loadOutline', () => {
    loadOutline(root, {
      items: [{ text: SAMPLE, children: [{ text: 'note', children: [] }] }],
    });
    const item = root.querySelector('[data-item]');
    const diagrams = [...item.querySelectorAll('[data-deal-diagram]')];
    assert.equal(diagrams.length, 1);
    assert.equal(getItemText(item.querySelectorAll('[data-item]')[1] || item), 'note');
    // note should still be present as a real child
    const real = [...item.querySelectorAll(':scope > ol > [data-item]')].filter(
      (el) => !isDealDiagramItem(el),
    );
    assert.equal(real.length, 1);
    assert.equal(getItemText(real[0]), 'note');
  });

  it('creates a diagram after blur when the line becomes a deal', async () => {
    const item = root.querySelector('[data-item]');
    const text = item.querySelector('.text');
    text.textContent = SAMPLE;
    text.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }));
    await Promise.resolve();
    assert.ok(item.querySelector('[data-deal-diagram]'));
  });
});
