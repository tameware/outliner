import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  parseAuctionFromLine,
  findAuctionInLine,
  findAllAuctionsInLine,
  buildAuctionDiagramElement,
  parseAuctionFromItem,
  auctionCallsToRows,
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

  it('presumes West when [Auction] has no direction', () => {
    const auction = parseAuctionFromLine('[Auction] 1H Pass 1S Pass 3NT AP');
    assert.ok(auction);
    assert.equal(auction.firstSeat, 'W');
    assert.deepEqual(auction.columns, ['W', 'N', 'E', 'S']);
    assert.deepEqual(auctionCallsToRows(auction), [
      ['1H', 'Pass', '1S', 'Pass'],
      ['3NT', 'Pass', 'Pass', 'Pass'],
    ]);
  });

  it('allows an unquoted direction in the Auction tag', () => {
    const quoted = parseAuctionFromLine('[Auction "E"] 1H Pass 1S Pass 3NT AP');
    const bare = parseAuctionFromLine('[Auction E] 1H Pass 1S Pass 3NT AP');
    assert.ok(quoted);
    assert.ok(bare);
    assert.equal(bare.firstSeat, 'E');
    assert.deepEqual(bare.calls, quoted.calls);
    assert.deepEqual(bare.columns, quoted.columns);
  });

  it('accepts suit glyphs in auction bids, same as suit letters', () => {
    const letters = parseAuctionFromLine('[Auction] 1H Pass 1S Pass 3NT AP');
    const glyphs = parseAuctionFromLine('[Auction] 1♥ Pass 1♠ Pass 3NT AP');
    assert.ok(letters);
    assert.ok(glyphs);
    assert.deepEqual(glyphs.calls, letters.calls);
    assert.deepEqual(glyphs.calls.slice(0, 3), ['1H', 'Pass', '1S']);
    const mixed = parseAuctionFromLine('[Auction W] 1♣ Pass 2♦! Pass 3♥=1= Pass 4♠ AP');
    assert.ok(mixed);
    assert.deepEqual(mixed.calls.slice(0, 7), [
      '1C',
      'Pass',
      '2D',
      'Pass',
      '3H',
      'Pass',
      '4S',
    ]);
  });

  it('normalizes bare N notrump bids to NT', () => {
    const auction = parseAuctionFromLine('[Auction] 1N Pass 2N Pass 3N AP');
    assert.ok(auction);
    assert.deepEqual(auction.calls.slice(0, 5), [
      '1NT',
      'Pass',
      '2NT',
      'Pass',
      '3NT',
    ]);
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

  it('keeps PBN "-" column spacers in the call list without showing a dash glyph', () => {
    const auction = parseAuctionFromLine('[Auction "W"] - Pass 1H Pass');
    assert.ok(auction);
    assert.deepEqual(auction.calls, ['-', 'Pass', '1H', 'Pass']);
    assert.deepEqual(auctionCallsToRows(auction), [['', 'Pass', '1H', 'Pass']]);
  });

  it('treats dealer-less call sequences as EW display with W–N–E–S seating', () => {
    const auction = parseAuctionFromLine('1C Pass 1H Pass 3NT Pass Pass Pass');
    assert.ok(auction);
    assert.equal(auction.firstSeat, 'W');
    assert.deepEqual(auction.columns, ['W', 'E']);
    assert.deepEqual(auction.calls.slice(0, 4), ['1C', 'Pass', '1H', 'Pass']);
    // Calls still walk W N E S; only W/E cells are shown (1H is East).
    assert.deepEqual(auctionCallsToRows(auction), [
      ['1C', '1H'],
      ['3NT', 'Pass'],
    ]);
  });

  it('finds a dealer-less auction mid-line', () => {
    const found = findAuctionInLine('Then 1H Pass 2H Pass 4H AP for board 3');
    assert.ok(found);
    assert.equal(found.auction.firstSeat, 'W');
    assert.deepEqual(found.auction.columns, ['W', 'E']);
    assert.equal(found.auction.calls[0], '1H');
  });

  it('finds multiple dealer-less auctions separated by prose', () => {
    const text =
      '1H Pass 1S Pass 3NT AP\nor\n1H Pass 1S Pass 4NT AP';
    const all = findAllAuctionsInLine(text);
    assert.equal(all.length, 2);
    assert.equal(all[0].auction.calls[4], '3NT');
    assert.equal(all[1].auction.calls[4], '4NT');
    assert.match(text.slice(all[0].end, all[1].start), /or/);
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

  it('does not paint "-" into bidding cells when using column spacers', () => {
    const auction = parseAuctionFromLine('[Auction "W"] - Pass 1H Pass');
    assert.ok(auction);
    const el = buildAuctionDiagramElement(auction);
    const cells = [...el.querySelectorAll('.auction-row:not(.auction-row-head) .auction-cell')].map(
      (c) => c.textContent,
    );
    assert.deepEqual(cells, ['', 'Pass', '1♥', 'Pass']);
    assert.ok(cells.every((t) => !t.includes('-')));
  });

  it('renders only West and East columns for dealer-less two-hand auctions', () => {
    const auction = parseAuctionFromLine('1C Pass 1H Pass 3NT AP');
    assert.ok(auction);
    const el = buildAuctionDiagramElement(auction);
    assert.equal(el.classList.contains('auction-diagram--ew'), true);
    const headers = [...el.querySelectorAll('.auction-head')].map(
      (cell) => cell.textContent,
    );
    assert.deepEqual(headers, ['W', 'E']);
    assert.equal(el.querySelectorAll('.auction-head').length, 2);
  });

  it('places East’s 1S under E when seatless [Auction] defaults to West', () => {
    const auction = parseAuctionFromLine('[Auction] 1H Pass 1S Pass 3NT AP');
    assert.ok(auction);
    const el = buildAuctionDiagramElement(auction);
    assert.equal(el.classList.contains('auction-diagram--ew'), false);
    const headers = [...el.querySelectorAll('.auction-head')].map(
      (cell) => cell.textContent,
    );
    assert.deepEqual(headers, ['W', 'N', 'E', 'S']);
    const firstDataRow = el.querySelectorAll('.auction-row')[1];
    const cells = [...firstDataRow.querySelectorAll('.auction-cell')].map(
      (c) => c.textContent.trim(),
    );
    assert.match(cells[0], /1♥|1H/);
    assert.equal(cells[1], 'Pass');
    assert.match(cells[2], /1♠|1S/);
    assert.equal(cells[3], 'Pass');
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

  it('keeps subheadings under a full-line auction and only folds bid rows', () => {
    loadOutline(root, {
      items: [
        {
          text: '[Auction] 1H Pass 1S Pass 3NT AP',
          children: [
            { text: 'Why not 4H?', children: [] },
            { text: 'Follow-up notes', children: [] },
          ],
        },
      ],
    });
    assert.equal(replaceDealLinesWithDiagrams(root), 1);
    assert.ok(root.querySelector('.auction-diagram'));
    const kids = [
      ...root.querySelectorAll(':scope > [data-item] > ol > [data-item]'),
    ];
    assert.equal(kids.length, 2);
    assert.match(kids[0].textContent ?? '', /Why not 4H/);
    assert.match(kids[1].textContent ?? '', /Follow-up notes/);
  });

  it('folds bid children into the diagram but keeps sibling subheadings', () => {
    loadOutline(root, {
      items: [
        {
          text: '[Auction "N"]',
          children: [
            { text: '1H Pass 1S Pass', children: [] },
            { text: '3NT AP', children: [] },
            { text: 'System notes', children: [] },
          ],
        },
      ],
    });
    assert.equal(replaceDealLinesWithDiagrams(root), 1);
    assert.ok(root.querySelector('.auction-diagram'));
    const kids = [
      ...root.querySelectorAll(':scope > [data-item] > ol > [data-item]'),
    ];
    assert.equal(kids.length, 1);
    assert.match(kids[0].textContent ?? '', /System notes/);
    assert.match(root.querySelector('.auction-diagram')?.textContent ?? '', /3NT/);
  });

  it('keeps child rows when the auction tag is surrounded by prose', () => {
    loadOutline(root, {
      items: [
        {
          text: 'Auction: [Auction "N"] then notes',
          children: [
            { text: 'partner style notes', children: [] },
            { text: 'more discussion', children: [] },
          ],
        },
      ],
    });
    // Inline tag with no same-line calls: do not fold/remove children.
    assert.equal(replaceDealLinesWithDiagrams(root), 0);
    assert.equal(root.querySelector('.auction-diagram'), null);
    assert.equal(root.querySelectorAll('[data-item]').length, 3);
  });

  it('renders dealer-less child call lines as EW diagrams without touching the parent', () => {
    loadOutline(root, {
      items: [
        {
          text: 'Two-hand auctions',
          children: [{ text: '1C Pass 1H Pass 3NT AP', children: [] }],
        },
      ],
    });
    assert.equal(replaceDealLinesWithDiagrams(root), 1);
    assert.ok(root.querySelector('.auction-diagram--ew'));
    assert.equal(
      root.querySelector(':scope > [data-item] .text')?.textContent,
      'Two-hand auctions',
    );
  });

  it('inline same-line auctions keep unrelated children', () => {
    loadOutline(root, {
      items: [
        {
          text: 'See [Auction "N"] 1H Pass 1S Pass 3NT AP here',
          children: [{ text: 'discussion note', children: [] }],
        },
      ],
    });
    assert.equal(replaceDealLinesWithDiagrams(root), 1);
    assert.ok(root.querySelector('.auction-diagram'));
    const kids = root.querySelectorAll(':scope > [data-item] > ol > [data-item]');
    assert.equal(kids.length, 1);
    assert.match(kids[0].textContent ?? '', /discussion note/);
  });

  it('renders two auctions in one item as separate diagrams with prose between', () => {
    loadOutline(root, {
      items: [
        {
          text: '1H Pass 1S Pass 3NT AP\nor\n1H Pass 1S Pass 4NT AP',
          children: [],
        },
      ],
    });
    assert.equal(replaceDealLinesWithDiagrams(root), 1);
    const host = root.querySelector(':scope > [data-item] > .row > .text');
    assert.ok(host);
    const kids = [...host.childNodes];
    const diagrams = kids.filter(
      (n) => n.nodeType === 1 && n.classList?.contains('auction-diagram'),
    );
    assert.equal(diagrams.length, 2);
    assert.match(diagrams[0].textContent ?? '', /3NT/);
    assert.match(diagrams[1].textContent ?? '', /4NT/);
    const firstDi = kids.indexOf(diagrams[0]);
    const secondDi = kids.indexOf(diagrams[1]);
    const between = kids
      .slice(firstDi + 1, secondDi)
      .map((n) => n.textContent ?? '')
      .join('');
    assert.match(between, /or/);
  });
});
