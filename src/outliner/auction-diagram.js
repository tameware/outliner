/**
 * Detect PBN-style auctions and build bidding-table diagrams for render views.
 */

import { SUIT_GLYPHS, createSuitNode } from './suit-shortcuts.js';

/**
 * Direction optional (defaults to West). Quotes around the direction are optional:
 * `[Auction]`, `[Auction W]`, `[Auction "N"]`.
 */
const AUCTION_TAG_RE = /\[Auction(?:\s+"?([NESW])"?)?\s*\]/i;
const NOTE_REF_RE = /^=\d+=$/;
const BID_RE = /^([1-7])(NT|[CDHS])(!)?$/i;
const CALL_TOKEN_RE = /^(?:AP|Pass|X|XX|-|[1-7](?:NT|[CDHS])!?)$/i;

/** Column order for a full four-seat bidding diagram. */
export const AUCTION_COLUMNS = ['W', 'N', 'E', 'S'];

/**
 * EW-only display: calls still walk W–N–E–S; North/South cells are omitted.
 * Used for bare dealer-less sequences (no `[Auction]` tag).
 */
export const EW_AUCTION_COLUMNS = ['W', 'E'];

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
 * @param {string} part
 * @returns {boolean}
 */
function isCallPart(part) {
  if (!part) return false;
  if (NOTE_REF_RE.test(part)) return true;
  const bare = part.replace(/!+$/g, '');
  if (CALL_TOKEN_RE.test(bare)) return true;
  return /^[1-7](?:NT|[CDHS])!?=\d+=$/i.test(part);
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
 * @param {string[]} calls
 * @returns {boolean}
 */
function looksLikeAuctionCalls(calls) {
  if (!calls?.length) return false;
  const substantive = calls.filter((c) => c && c !== '-');
  if (substantive.length < 2) return false;
  return substantive.some((c) => /^[1-7](NT|[CDHS])$/i.test(c));
}

/**
 * @param {string} body
 * @param {'N'|'E'|'S'|'W'} firstSeat
 * @param {string[]} [columns]
 * @returns {{ firstSeat: 'N'|'E'|'S'|'W', calls: string[], columns: string[] }}
 */
function auctionFromBody(body, firstSeat, columns = AUCTION_COLUMNS) {
  // Keep PBN "-" tokens: they pad columns (W-first tables) and never paint as text.
  return { firstSeat, calls: tokenizeAuctionCalls(body), columns };
}

/**
 * Consume a run of call tokens from `rest`, returning the matched chunk.
 * @param {string} rest
 * @returns {string}
 */
function consumeCallChunk(rest) {
  const parts = rest.split(/(\s+)/);
  let callChunk = '';
  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      if (!callChunk) continue;
      callChunk += part;
      continue;
    }
    if (isCallPart(part)) {
      callChunk += part;
      continue;
    }
    break;
  }
  return callChunk.trimEnd();
}

/**
 * @param {string} line
 * @returns {{ firstSeat: 'N'|'E'|'S'|'W', calls: string[], columns: string[] } | null}
 */
export function parseAuctionFromLine(line) {
  return findAuctionInLine(line)?.auction ?? null;
}

/**
 * @param {RegExpMatchArray} tagged
 * @returns {{ firstSeat: 'N'|'E'|'S'|'W', columns: string[] }}
 */
function seatingFromTag(tagged) {
  const seat = tagged[1]?.toUpperCase();
  if (seat === 'N' || seat === 'E' || seat === 'S' || seat === 'W') {
    return { firstSeat: seat, columns: AUCTION_COLUMNS };
  }
  // Missing direction → West, full four-hand table.
  return { firstSeat: 'W', columns: AUCTION_COLUMNS };
}

/**
 * Locate a tagged PBN auction, or a dealer-less call sequence (EW display).
 * @param {string} line
 * @returns {{
 *   auction: { firstSeat: 'N'|'E'|'S'|'W', calls: string[], columns: string[] },
 *   start: number,
 *   end: number,
 * } | null}
 */
export function findAuctionInLine(line) {
  const text = String(line ?? '');
  const tagged = text.match(AUCTION_TAG_RE);
  if (tagged && tagged.index != null) {
    const { firstSeat, columns } = seatingFromTag(tagged);
    const afterTag = text.slice(tagged.index + tagged[0].length);
    const leadingWs = afterTag.match(/^\s*/)?.[0] ?? '';
    const callChunk = consumeCallChunk(afterTag.slice(leadingWs.length));
    const auction = auctionFromBody(callChunk, firstSeat, columns);
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

  return findBareEwAuctionInLine(text);
}

/**
 * Dealer-less call sequence → West deals, East responds (two columns).
 * @param {string} text
 * @returns {{
 *   auction: { firstSeat: 'N'|'E'|'S'|'W', calls: string[], columns: string[] },
 *   start: number,
 *   end: number,
 * } | null}
 */
function findBareEwAuctionInLine(text) {
  const parts = text.split(/(\s+)/);
  let index = 0;
  /** @type {{ start: number, end: number, chunk: string } | null} */
  let best = null;

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      index += part.length;
      continue;
    }
    if (!isCallPart(part)) {
      index += part.length;
      continue;
    }

    const start = index;
    let chunk = part;
    let end = index + part.length;
    let j = i + 1;
    let cursor = end;
    while (j < parts.length) {
      const next = parts[j];
      if (!next) {
        j += 1;
        continue;
      }
      if (/^\s+$/.test(next)) {
        // Peek: only keep whitespace if another call follows
        let k = j + 1;
        while (k < parts.length && !parts[k]) k += 1;
        if (k >= parts.length || !isCallPart(parts[k])) break;
        chunk += next;
        cursor += next.length;
        j += 1;
        continue;
      }
      if (!isCallPart(next)) break;
      chunk += next;
      cursor += next.length;
      end = cursor;
      j += 1;
    }

    const calls = tokenizeAuctionCalls(chunk);
    if (looksLikeAuctionCalls(calls)) {
      const candidate = { start, end, chunk };
      if (!best || chunk.length > best.chunk.length) best = candidate;
    }

    index += part.length;
  }

  if (!best) return null;
  return {
    auction: auctionFromBody(best.chunk, 'W', EW_AUCTION_COLUMNS),
    start: best.start,
    end: best.end,
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
 * True when the whole line is only auction call tokens (a foldable bid row).
 * Prose / subheadings return false even if they mention a bid word.
 * @param {string} text
 * @returns {boolean}
 */
export function isAuctionCallRow(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return false;
  if (AUCTION_TAG_RE.test(raw)) return false;
  const parts = raw.split(/\s+/).filter(Boolean);
  if (!parts.length || !parts.every(isCallPart)) return false;
  return tokenizeAuctionCalls(raw).length > 0;
}

/**
 * @param {HTMLElement} item
 * @returns {string[]}
 */
function collectChildBidCalls(item) {
  /** @type {string[]} */
  const calls = [];
  for (const child of directChildItems(item)) {
    const childText = itemTextEl(child)?.textContent ?? '';
    if (!isAuctionCallRow(childText)) continue;
    calls.push(...tokenizeAuctionCalls(childText));
  }
  return calls;
}

/**
 * Parse auction from an outline item: same-line calls and/or child bid rows.
 * @param {HTMLElement | null | undefined} item
 * @returns {{ firstSeat: 'N'|'E'|'S'|'W', calls: string[], columns: string[] } | null}
 */
export function parseAuctionFromItem(item) {
  if (!item) return null;
  const text = itemTextEl(item)?.textContent ?? '';
  const tagged = text.match(AUCTION_TAG_RE);
  if (tagged) {
    const { firstSeat, columns } = seatingFromTag(tagged);
    const after = text.slice(tagged.index + tagged[0].length);
    const calls = [
      ...tokenizeAuctionCalls(after),
      ...collectChildBidCalls(item),
    ];
    return { firstSeat, calls, columns };
  }

  // Dealer-less: whole line (and optional child rows) as West–East.
  const found = findBareEwAuctionInLine(text);
  if (!found) return null;
  const completeLine =
    !text.slice(0, found.start).trim() && !text.slice(found.end).trim();
  if (!completeLine) {
    return found.auction;
  }
  const calls = [...found.auction.calls, ...collectChildBidCalls(item)];
  if (!looksLikeAuctionCalls(calls)) return null;
  return { firstSeat: 'W', calls, columns: EW_AUCTION_COLUMNS };
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
 * Lay out calls in W–N–E–S order from `firstSeat`, keeping only `columns` cells.
 * EW display still consumes North/South calls so East’s bids land under E.
 * @param {{ firstSeat: 'N'|'E'|'S'|'W', calls: string[], columns?: string[] }} auction
 * @returns {string[][]}
 */
export function auctionCallsToRows(auction) {
  const display = auction.columns?.length ? auction.columns : AUCTION_COLUMNS;
  const circle = AUCTION_COLUMNS;
  let seatIdx = circle.indexOf(auction.firstSeat);
  if (seatIdx < 0) seatIdx = 0;

  /** @type {string[][]} */
  const rows = [];
  let row = Array.from({ length: display.length }, () => '');
  let wroteInRound = false;

  const pushRound = () => {
    rows.push(row);
    row = Array.from({ length: display.length }, () => '');
    wroteInRound = false;
  };

  for (const call of auction.calls ?? []) {
    const seat = circle[seatIdx % circle.length];
    const di = display.indexOf(seat);
    if (call !== '-') {
      if (di >= 0) {
        row[di] = call;
        wroteInRound = true;
      }
    } else if (di >= 0) {
      // Explicit spacer under a displayed seat: leave cell empty.
      wroteInRound = true;
    }
    seatIdx += 1;
    if (seatIdx % circle.length === 0) {
      if (wroteInRound || row.some(Boolean)) pushRound();
    }
  }
  if (wroteInRound || row.some(Boolean)) {
    rows.push(row);
  }
  return rows;
}

/**
 * @param {{ firstSeat: 'N'|'E'|'S'|'W', calls: string[], columns?: string[] }} auction
 * @returns {HTMLElement}
 */
export function buildAuctionDiagramElement(auction) {
  const columns = auction.columns?.length ? auction.columns : AUCTION_COLUMNS;
  const wrap = document.createElement('div');
  wrap.className = 'auction-diagram';
  if (columns.length === 2 && columns[0] === 'W' && columns[1] === 'E') {
    wrap.classList.add('auction-diagram--ew');
  }
  wrap.setAttribute('contenteditable', 'false');

  const table = document.createElement('div');
  table.className = 'auction-table';

  const head = document.createElement('div');
  head.className = 'auction-row auction-row-head';
  for (const seat of columns) {
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
