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
/** Suit as letter or glyph (♣♦♥♠); bare N and NT both mean notrump. */
const SUIT_TOKEN = `NT|N|[CDHS]|[${SUIT_GLYPHS.clubs}${SUIT_GLYPHS.diamonds}${SUIT_GLYPHS.hearts}${SUIT_GLYPHS.spades}]`;
const BID_RE = new RegExp(`^([1-7])(${SUIT_TOKEN})(!)?$`, 'i');
const CALL_TOKEN_RE = new RegExp(
  `^(?:AP|Pass|X|XX|-|[1-7](?:${SUIT_TOKEN})!?)$`,
  'i',
);
const GLUED_BID_NOTE_RE = new RegExp(
  `^([1-7](?:${SUIT_TOKEN})!?)(=\\d+=)$`,
  'i',
);

/**
 * @param {string} suit
 * @returns {'NT'|'C'|'D'|'H'|'S'|null}
 */
function suitToLetter(suit) {
  const s = String(suit ?? '');
  if (/^N(?:T)?$/i.test(s)) return 'NT';
  const upper = s.toUpperCase();
  if (upper === 'C' || upper === 'D' || upper === 'H' || upper === 'S') {
    return /** @type {'C'|'D'|'H'|'S'} */ (upper);
  }
  if (s === SUIT_GLYPHS.clubs) return 'C';
  if (s === SUIT_GLYPHS.diamonds) return 'D';
  if (s === SUIT_GLYPHS.hearts) return 'H';
  if (s === SUIT_GLYPHS.spades) return 'S';
  return null;
}

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
  if (bid) {
    const suit = suitToLetter(bid[2]);
    if (suit) return [`${bid[1]}${suit}`];
  }
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
  return GLUED_BID_NOTE_RE.test(part);
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
      const glued = part.match(GLUED_BID_NOTE_RE);
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
 * @typedef {{
 *   auction: { firstSeat: 'N'|'E'|'S'|'W', calls: string[], columns: string[] },
 *   start: number,
 *   end: number,
 * }} AuctionMatch
 */

/**
 * Locate the first tagged PBN auction or dealer-less call sequence.
 * @param {string} line
 * @returns {AuctionMatch | null}
 */
export function findAuctionInLine(line) {
  return findAllAuctionsInLine(line)[0] ?? null;
}

/**
 * Locate every tagged or dealer-less auction in left-to-right order.
 * Intervening prose (e.g. "or") is left outside the matches.
 * @param {string} line
 * @returns {AuctionMatch[]}
 */
export function findAllAuctionsInLine(line) {
  const text = String(line ?? '');
  /** @type {AuctionMatch[]} */
  const tagged = [];
  for (const match of text.matchAll(new RegExp(AUCTION_TAG_RE.source, 'gi'))) {
    if (match.index == null) continue;
    const { firstSeat, columns } = seatingFromTag(match);
    const afterTag = text.slice(match.index + match[0].length);
    const leadingWs = afterTag.match(/^\s*/)?.[0] ?? '';
    const callChunk = consumeCallChunk(afterTag.slice(leadingWs.length));
    tagged.push({
      auction: auctionFromBody(callChunk, firstSeat, columns),
      start: match.index,
      end:
        match.index + match[0].length + leadingWs.length + callChunk.length,
    });
  }

  const bare = findAllBareEwAuctionsInLine(text).filter(
    (b) => !tagged.some((t) => rangesOverlap(b, t)),
  );
  return [...tagged, ...bare].sort((a, b) => a.start - b.start);
}

/**
 * @param {{ start: number, end: number }} a
 * @param {{ start: number, end: number }} b
 */
function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

/**
 * Dealer-less call runs → West-first EW display, non-overlapping left to right.
 * @param {string} text
 * @returns {AuctionMatch[]}
 */
function findAllBareEwAuctionsInLine(text) {
  const parts = text.split(/(\s+)/);
  let index = 0;
  /** @type {AuctionMatch[]} */
  const found = [];

  for (let i = 0; i < parts.length; ) {
    const part = parts[i];
    if (!part) {
      i += 1;
      continue;
    }
    if (/^\s+$/.test(part)) {
      index += part.length;
      i += 1;
      continue;
    }
    if (!isCallPart(part)) {
      index += part.length;
      i += 1;
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
      found.push({
        auction: auctionFromBody(chunk, 'W', EW_AUCTION_COLUMNS),
        start,
        end,
      });
      index = end;
      i = j;
      continue;
    }

    index += part.length;
    i += 1;
  }

  return found;
}

/**
 * @param {string} text
 * @returns {AuctionMatch | null}
 */
function findBareEwAuctionInLine(text) {
  return findAllBareEwAuctionsInLine(text)[0] ?? null;
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
  const bid = call.match(/^([1-7])(N(?:T)?|C|D|H|S)$/i);
  if (!bid) {
    frag.appendChild(document.createTextNode(call));
    return frag;
  }
  frag.appendChild(document.createTextNode(bid[1]));
  const den = bid[2].toUpperCase();
  if (den === 'N' || den === 'NT') {
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
