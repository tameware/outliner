import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  parseAuctionFromLine,
  findAuctionInLine,
  buildAuctionDiagramElement,
  parseAuctionFromItem,
} from '../src/outliner/auction-diagram.js';
import {
  mountOutliner,
  loadOutline,
} from '../src/outliner/outliner.js';
import {
  replaceDealLinesWithDiagrams,
  countDealLinesInRoot,
} from '../src/outliner/deal-diagram.js';

describe('parseAuctionFromLine', () => {
  it('parses [Auction "N"] with calls on the same line', () => {
    const auction = parseAuctionFromLine(
      '[Auction "N"] 1D 1S 3H 4S 4NT X Pass Pass 5C X 5H X Pass Pass Pass',
    );
    assert.ok(auction);
    assert.equal(auction.firstSeat, 'N');
    assert.deepEqual(auction.calls.slice(0, 4), ['1D', '1S', '3H', '4S']);
    assert.ok(auction.calls.includes('X'));
    assert.ok(auction.calls.includes('Pass'));
  });

  it('expands AP into three Pass calls', () => {
    const auction = parseAuctionFromLine('[Auction "E"] 1H Pass 1S Pass 3NT AP');
    assert.ok(auction);
    assert.equal(auction.firstSeat, 'E');
    assert.deepEqual(auction.calls.slice(-3), ['Pass', 'Pass', 'Pass']);
  });

  it('strips note refs and alert marks from calls', () => {
    const auction = parseAuctionFromLine(
      '[Auction "E"] 1H Pass 1S =1= Pass 2C ! Pass 3NT AP',
    );
    assert.ok(auction);
    assert.equal(auction.calls[2], '1S');
    assert.equal(auction.calls[4], '2C');
  });

  it('returns null for non-auction text', () => {
    assert.equal(parseAuctionFromLine('Just a headline'), null);
    assert.equal(parseAuctionFromLine('[Deal "N:AKQ.JT9.876.5432"]'), null);
    assert.equal(parseAuctionFromLine(''), null);
  });

  it('finds an auction embedded mid-line', () => {
    const found = findAuctionInLine(
      'Then [Auction "W"] Pass 1H Pass 1S Pass 3NT AP ended',
    );
    assert.ok(found);
    assert.equal(found.auction.firstSeat, 'W');
    assert.match(
      'Then [Auction "W"] Pass 1H Pass 1S Pass 3NT AP ended'.slice(
        found.start,
        found.end,
      ),
      /^\[Auction/i,
    );
  });
});

describe('buildAuctionDiagramElement', () => {
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

  it('renders a West–North–East–South bidding table with suit glyphs', () => {
    const auction = parseAuctionFromLine(
      '[Auction "N"] 1H Pass 1S Pass 2NT Pass 3NT Pass Pass Pass',
    );
    assert.ok(auction);
    const el = buildAuctionDiagramElement(auction);
    assert.equal(el.classList.contains('auction-diagram'), true);
    assert.equal(el.getAttribute('contenteditable'), 'false');
    const headers = [...el.querySelectorAll('.auction-head')].map(
      (cell) => cell.textContent,
    );
    assert.deepEqual(headers, ['W', 'N', 'E', 'S']);
    // Dealer North → first call under N, West empty on row 1
    const firstDataRow = el.querySelectorAll('.auction-row')[1];
    const cells = [...firstDataRow.querySelectorAll('.auction-cell')].map(
      (c) => c.textContent.trim(),
    );
    assert.equal(cells[0], '');
    assert.match(cells[1], /1♥|1H/);
    assert.ok(firstDataRow.querySelector('.suit-red'), 'hearts are red');
  });
});

describe('parseAuctionFromItem with child bid lines', () => {
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
            <div class="text" contenteditable="true"></div>
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

  it('reads [Auction "N"] parent plus child call rows', () => {
    loadOutline(root, {
      items: [
        {
          text: '[Auction "N"]',
          children: [
            { text: '1D 1S 3H 4S', children: [] },
            { text: '4NT X Pass Pass', children: [] },
            { text: '5H X Pass Pass Pass', children: [] },
          ],
        },
      ],
    });
    const item = root.querySelector('[data-item]');
    const auction = parseAuctionFromItem(item);
    assert.ok(auction);
    assert.equal(auction.firstSeat, 'N');
    assert.equal(auction.calls[0], '1D');
    assert.ok(auction.calls.includes('4NT'));
  });

  it('replaceDealLinesWithDiagrams swaps auctions for bidding tables', () => {
    loadOutline(root, {
      items: [
        {
          text: '[Auction "E"] 1H Pass 1S Pass 3NT AP',
          children: [],
        },
      ],
    });
    assert.ok(countDealLinesInRoot(root) >= 1);
    assert.equal(replaceDealLinesWithDiagrams(root), 1);
    assert.ok(root.querySelector('.auction-diagram'));
    assert.equal(root.querySelector('.text'), null);
  });

  it('replaceDealLinesWithDiagrams uses child rows under an Auction parent', () => {
    loadOutline(root, {
      items: [
        {
          text: '[Auction "W"]',
          children: [
            { text: 'Pass 1H Pass 1S', children: [] },
            { text: 'Pass 3NT Pass Pass', children: [] },
            { text: 'Pass', children: [] },
          ],
        },
      ],
    });
    assert.equal(replaceDealLinesWithDiagrams(root), 1);
    assert.ok(root.querySelector('.auction-diagram'));
    assert.equal(root.querySelectorAll('[data-item]').length, 1);
  });
});
