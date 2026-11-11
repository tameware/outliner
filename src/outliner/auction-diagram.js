/**
 * Detect PBN-style auctions and build bidding-table diagrams for render views.
 */

import { SUIT_GLYPHS, createSuitNode } from './suit-shortcuts.js';

const AUCTION_TAG_RE = /\[Auction\s+"([NESW])"\s*\]/i;
const NOTE_REF_RE = /^=\d+=$/;
const BID_RE = /^([1-7])(NT|[CDHS])(!)?$/i;
const CALL_TOKEN_RE = /^(?:AP|Pass|X|XX|-|[1-7](?:NT|[CDHS])!?)$/i;

/** Column order for the printed bidding diagram. */
export const AUCTION_COLUMNS = ['W', 'N', 'E', 'S'];

/**
 * @param {string} token
 * @returns {string[]}
 */
function normalizeCallToken(token) {
  const t = String(token ?? '').trim();
  if (!t || NOTE_REF_RE.test(t)) return [];
  const bare = t.replace(/!+$/g, '');
  if (/^AP$/i.test(bare)) return ['Pass', 'Pass', 'Pass'];
  if (/^Pass$/i.test(bare)) return ['Pass'];
  if (/^XX$/i.test(bare)) return ['XX'];
  if (/^X$/i.test(bare)) return ['X'];
  if (bare === '-') return ['-'];
  const bid = bare.match(BID_RE);
  if (bid) return [`${bid[1]}${bid[2].toUpperCase()}`];
  return [];
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function tokenizeAuctionCalls(text) {
  const raw = String(text ?? '');
  if (!raw.trim()) return [];
  const parts = raw.split(/\s+/).filter(Boolean);
  /** @type {string[]} */
  const calls = [];
  for (const part of parts) {
    if (NOTE_REF_RE.test(part)) continue;
    if (!CALL_TOKEN_RE.test(part) && !NOTE_REF_RE.test(part)) {
      // Allow glued note refs: 1S=1=
      const glued = part.match(/^([1-7](?:NT|[CDHS])!?)(=\d+=)$/i);
      if (glued) {
        calls.push(...normalizeCallToken(glued[1]));
        continue;
      }
      continue;
    }
    calls.push(...normalizeCallToken(part));
  }
  return calls;
}

/**
 * @param {string} body
 * @param {'N'|'E'|'S'|'W'} firstSeat
 * @returns {{ firstSeat: 'N'|'E'|'S'|'W', calls: string[] } | null}
 */
function auctionFromBody(body, firstSeat) {
  const calls = tokenizeAuctionCalls(body).filter((c) => c !== '-');
  // Keep leading '-' only as column spacers — filter removed them; re-tokenize with dashes.
  const withDashes = tokenizeAuctionCalls(body);
  if (withDashes.length === 0) {
    return { firstSeat, calls: [] };
  }
  return { firstSeat, calls: withDashes };
}

/**
 * @param {string} line
 * @returns {{ firstSeat: 'N'|'E'|'S'|'W', calls: string[] } | null}
 */
export function parseAuctionFromLine(line) {
  return findAuctionInLine(line)?.auction ?? null;
}

/**
 * Locate a PBN auction tag (and following same-line calls) in text.
 * @param {string} line
 * @returns {{
 *   auction: { firstSeat: 'N'|'E'|'S'|'W', calls: string[] },
 *   start: number,
 *   end: number,
 * } | null}
 */
export function findAuctionInLine(line) {
  const text = String(line ?? '');
  const tagged = text.match(AUCTION_TAG_RE);
  if (!tagged || tagged.index == null) return null;
  const firstSeat = /** @type {'N'|'E'|'S'|'W'} */ (tagged[1].toUpperCase());
  const afterTag = text.slice(tagged.index + tagged[0].length);
  const leadingWs = afterTag.match(/^\s*/)?.[0] ?? '';
  const rest = afterTag.slice(leadingWs.length);
  const parts = rest.split(/(\s+)/);
  let callChunk = '';
  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      if (!callChunk) continue;
      callChunk += part;
      continue;
    }
    const bare = part.replace(/!+$/g, '');
    const gluedOk = /^[1-7](?:NT|[CDHS])!?=\d+=$/i.test(part);
    if (CALL_TOKEN_RE.test(bare) || NOTE_REF_RE.test(part) || gluedOk) {
      callChunk += part;
      continue;
    }
    break;
  }
  callChunk = callChunk.trimEnd();
  const auction = auctionFromBody(callChunk, firstSeat);
  if (!auction) return null;
  return {
    auction,
    start: tagged.index,
    end:
      tagged.index +
      tagged[0].length +
      leadingWs.length +
      callChunk.length,
  };
}

/**
 * @param {HTMLElement | null | undefined} item
 * @returns {HTMLElement | null}
 */
function itemTextEl(item) {
  return item?.querySelector?.(':scope > .row > .text') ?? null;
}

/**
 * @param {HTMLElement | null | undefined} item
 * @returns {HTMLElement[]}
 */
function directChildItems(item) {
  const list = item?.querySelector?.(':scope > ol');
  if (!list) return [];
  return [...list.children].filter((el) => el.matches?.('[data-item]'));
}

/**
 * Parse auction from an outline item: same-line calls and/or child bid rows.
 * @param {HTMLElement | null | undefined} item
 * @returns {{ firstSeat: 'N'|'E'|'S'|'W', calls: string[] } | null}
 */
export function parseAuctionFromItem(item) {
  if (!item) return null;
  const text = itemTextEl(item)?.textContent ?? '';
  const tagged = text.match(AUCTION_TAG_RE);
  if (!tagged) return null;
  const firstSeat = /** @type {'N'|'E'|'S'|'W'} */ (tagged[1].toUpperCase());
  const after = text.slice(tagged.index + tagged[0].length);
  /** @type {string[]} */
  const calls = [...tokenizeAuctionCalls(after)];
  for (const child of directChildItems(item)) {
    const childText = itemTextEl(child)?.textContent ?? '';
    // Child rows should look like auction calls, not nested auctions/deals.
    if (AUCTION_TAG_RE.test(childText)) continue;
    const rowCalls = tokenizeAuctionCalls(childText);
    if (rowCalls.length === 0) continue;
    calls.push(...rowCalls);
  }
  return { firstSeat, calls };
}

/**
 * @param {string} call
 * @returns {DocumentFragment | Text}
 */
function formatCallNodes(call) {
  const frag = document.createDocumentFragment();
  if (!call || call === '-') return frag;
  if (call === 'Pass' || call === 'X' || call === 'XX') {
    frag.appendChild(document.createTextNode(call));
    return frag;
  }
  const bid = call.match(/^([1-7])(NT|C|D|H|S)$/i);
  if (!bid) {
    frag.appendChild(document.createTextNode(call));
    return frag;
  }
  frag.appendChild(document.createTextNode(bid[1]));
  const den = bid[2].toUpperCase();
  if (den === 'NT') {
    frag.appendChild(document.createTextNode('NT'));
    return frag;
  }
  const glyph =
    den === 'C'
      ? SUIT_GLYPHS.clubs
      : den === 'D'
        ? SUIT_GLYPHS.diamonds
        : den === 'H'
          ? SUIT_GLYPHS.hearts
          : SUIT_GLYPHS.spades;
  frag.appendChild(createSuitNode(glyph));
  return frag;
}

/**
 * @param {{ firstSeat: 'N'|'E'|'S'|'W', calls: string[] }} auction
 * @returns {string[][]}
 */
export function auctionCallsToRows(auction) {
  const startCol = AUCTION_COLUMNS.indexOf(auction.firstSeat);
  /** @type {string[][]} */
  const rows = [];
  let row = ['', '', '', ''];
  let col = startCol >= 0 ? startCol : 0;
  for (const call of auction.calls ?? []) {
    if (call === '-') {
      col += 1;
      if (col >= 4) {
        rows.push(row);
        row = ['', '', '', ''];
        col = 0;
      }
      continue;
    }
    row[col] = call;
    col += 1;
    if (col >= 4) {
      rows.push(row);
      row = ['', '', '', ''];
      col = 0;
    }
  }
  if (col > 0 || rows.length === 0) {
    // Include partial last row when any call placed, or empty header-only table
    if (auction.calls?.length) {
      if (row.some(Boolean) || col > 0) rows.push(row);
    }
  }
  return rows;
}

/**
 * @param {{ firstSeat: 'N'|'E'|'S'|'W', calls: string[] }} auction
 * @returns {HTMLElement}
 */
export function buildAuctionDiagramElement(auction) {
  const wrap = document.createElement('div');
  wrap.className = 'auction-diagram';
  wrap.setAttribute('contenteditable', 'false');

  const table = document.createElement('div');
  table.className = 'auction-table';

  const head = document.createElement('div');
  head.className = 'auction-row auction-row-head';
  for (const seat of AUCTION_COLUMNS) {
    const cell = document.createElement('div');
    cell.className = 'auction-cell auction-head';
    cell.textContent = seat;
    head.appendChild(cell);
  }
  table.appendChild(head);

  for (const rowCalls of auctionCallsToRows(auction)) {
    const row = document.createElement('div');
    row.className = 'auction-row';
    for (const call of rowCalls) {
      const cell = document.createElement('div');
      cell.className = 'auction-cell';
      cell.appendChild(formatCallNodes(call));
      row.appendChild(cell);
    }
    table.appendChild(row);
  }

  wrap.appendChild(table);
  return wrap;
}
