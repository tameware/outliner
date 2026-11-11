/**
 * Detect PBN-style bridge deals/auctions and build diagrams for render views.
 */

import { SUIT_GLYPHS, createSuitNode } from './suit-shortcuts.js';
import {
  findAuctionInLine,
  parseAuctionFromItem,
  buildAuctionDiagramElement,
  isAuctionCallRow,
} from './auction-diagram.js';

const RANK = 'AKQJT98765432';
const SUIT_PART = `(?:[${RANK}]*|-)`;
const HAND_RE = new RegExp(
  `${SUIT_PART}\\.${SUIT_PART}\\.${SUIT_PART}\\.${SUIT_PART}`,
  'i',
);
const HAND_SRC = HAND_RE.source;
/** Full-line or embedded deal body (optional seat prefix + four hands). */
const DEAL_BODY_RE = new RegExp(
  `(?:([NESW]):)?\\s*(${HAND_SRC})\\s+(${HAND_SRC})\\s+(${HAND_SRC})\\s+(${HAND_SRC})`,
  'i',
);
const DEAL_TAG_RE = /\[Deal\s+"([^"]+)"\s*\]/i;

const SEATS = ['N', 'E', 'S', 'W'];

/**
 * @param {string} suit
 * @returns {string}
 */
function normalizeSuit(suit) {
  const s = String(suit ?? '').trim();
  if (!s || s === '-') return '';
  return s.toUpperCase();
}

/**
 * @param {string} hand
 * @returns {{ spades: string, hearts: string, diamonds: string, clubs: string } | null}
 */
function parseHand(hand) {
  const parts = String(hand).split('.');
  if (parts.length !== 4) return null;
  return {
    spades: normalizeSuit(parts[0]),
    hearts: normalizeSuit(parts[1]),
    diamonds: normalizeSuit(parts[2]),
    clubs: normalizeSuit(parts[3]),
  };
}

/**
 * @param {string} raw
 * @returns {{ hands: Record<'N'|'E'|'S'|'W', { spades: string, hearts: string, diamonds: string, clubs: string }> } | null}
 */
function parseDealBody(raw) {
  let text = String(raw ?? '').trim();
  if (!text) return null;
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }
  const m = text.match(DEAL_BODY_RE);
  if (!m || m.index !== 0) return null;
  // Require the body to consume the whole string (aside from trailing junk stripped by callers).
  if (m[0].length !== text.length) {
    // Allow trailing whitespace only
    if (text.slice(m[0].length).trim() !== '') return null;
  }

  const firstSeat = (m[1] || 'N').toUpperCase();
  const parsedHands = [m[2], m[3], m[4], m[5]].map(parseHand);
  if (parsedHands.some((h) => !h)) return null;

  const start = SEATS.indexOf(firstSeat);
  if (start < 0) return null;

  /** @type {Record<string, { spades: string, hearts: string, diamonds: string, clubs: string }>} */
  const hands = {};
  for (let i = 0; i < 4; i += 1) {
    hands[SEATS[(start + i) % 4]] = parsedHands[i];
  }
  return { hands };
}

/**
 * Locate a PBN deal anywhere in a line (full line, [Deal "…"], or embedded).
 * @param {string} line
 * @returns {{
 *   deal: { hands: Record<'N'|'E'|'S'|'W', { spades: string, hearts: string, diamonds: string, clubs: string }> },
 *   start: number,
 *   end: number,
 * } | null}
 */
export function findDealInLine(line) {
  const text = String(line ?? '');
  if (!text.trim()) return null;

  const tagged = text.match(DEAL_TAG_RE);
  if (tagged && tagged.index != null) {
    const deal = parseDealBody(tagged[1]);
    if (deal) {
      return {
        deal,
        start: tagged.index,
        end: tagged.index + tagged[0].length,
      };
    }
  }

  // Whole trimmed line (including "…" wrappers) — preserves prior full-line behavior.
  const leadingWs = (text.match(/^\s*/) || [''])[0].length;
  const trailingWs = (text.match(/\s*$/) || [''])[0].length;
  const trimmed = text.slice(leadingWs, text.length - trailingWs);
  const whole = parseDealBody(trimmed);
  if (whole) {
    return {
      deal: whole,
      start: leadingWs,
      end: text.length - trailingWs,
    };
  }

  // Prefer a seat-prefixed deal when embedded (avoids matching a trailing fragment).
  const seatPrefixed = new RegExp(
    `([NESW]):\\s*(${HAND_SRC})\\s+(${HAND_SRC})\\s+(${HAND_SRC})\\s+(${HAND_SRC})`,
    'i',
  );
  const seated = text.match(seatPrefixed);
  if (seated && seated.index != null) {
    const deal = parseDealBody(seated[0]);
    if (deal) {
      return {
        deal,
        start: seated.index,
        end: seated.index + seated[0].length,
      };
    }
  }

  const bare = text.match(DEAL_BODY_RE);
  if (bare && bare.index != null) {
    const deal = parseDealBody(bare[0]);
    if (deal) {
      return {
        deal,
        start: bare.index,
        end: bare.index + bare[0].length,
      };
    }
  }

  return null;
}

/**
 * @param {string} line
 * @returns {{ hands: Record<'N'|'E'|'S'|'W', { spades: string, hearts: string, diamonds: string, clubs: string }> } | null}
 */
export function parseDealFromLine(line) {
  return findDealInLine(line)?.deal ?? null;
}

/**
 * Legacy child-diagram marker (no longer created; kept for OPML/search filters).
 * @param {HTMLElement | null | undefined} item
 */
export function isDealDiagramItem(item) {
  return item?.dataset?.dealDiagram === 'true';
}

/**
 * @param {{ spades?: string, hearts?: string, diamonds?: string, clubs?: string } | null | undefined} hand
 * @returns {boolean}
 */
function handHasCards(hand) {
  if (!hand) return false;
  return Boolean(hand.spades || hand.hearts || hand.diamonds || hand.clubs);
}

/**
 * @param {{ spades: string, hearts: string, diamonds: string, clubs: string }} hand
 * @param {string} seatClass
 */
function buildHandEl(hand, seatClass) {
  const el = document.createElement('div');
  el.className = `deal-hand ${seatClass}`;
  const rows = [
    [SUIT_GLYPHS.spades, hand.spades],
    [SUIT_GLYPHS.hearts, hand.hearts],
    [SUIT_GLYPHS.diamonds, hand.diamonds],
    [SUIT_GLYPHS.clubs, hand.clubs],
  ];
  for (const [glyph, cards] of rows) {
    const suitRow = document.createElement('div');
    suitRow.className = 'deal-suit';
    suitRow.appendChild(createSuitNode(glyph));
    suitRow.appendChild(document.createTextNode(`\u00A0${cards || ''}`));
    el.appendChild(suitRow);
  }
  return el;
}

/**
 * @param {{ hands: Record<'N'|'E'|'S'|'W', { spades: string, hearts: string, diamonds: string, clubs: string }> }} deal
 * @returns {HTMLElement}
 */
export function buildDealDiagramElement(deal) {
  const wrap = document.createElement('div');
  wrap.className = 'deal-diagram';
  wrap.setAttribute('contenteditable', 'false');

  const showNS =
    handHasCards(deal.hands.N) || handHasCards(deal.hands.S);
  const showEW =
    handHasCards(deal.hands.E) || handHasCards(deal.hands.W);

  if (showEW && !showNS) wrap.classList.add('deal-diagram--ew-only');

  // One stack so N and S share a left edge; the stack itself stays centered.
  const stack = document.createElement('div');
  stack.className = 'deal-stack';

  if (showNS) {
    stack.appendChild(buildHandEl(deal.hands.N, 'deal-north'));
  }
  if (showEW) {
    const mid = document.createElement('div');
    mid.className = 'deal-mid';
    mid.appendChild(buildHandEl(deal.hands.W, 'deal-west'));
    mid.appendChild(buildHandEl(deal.hands.E, 'deal-east'));
    stack.appendChild(mid);
  }
  if (showNS) {
    stack.appendChild(buildHandEl(deal.hands.S, 'deal-south'));
  }
  wrap.appendChild(stack);
  return wrap;
}

/**
 * @param {HTMLElement} item
 * @returns {HTMLElement | null}
 */
function itemTextEl(item) {
  return item.querySelector(':scope > .row > .text');
}

/**
 * Whether an outline item has a PBN deal and/or auction to render.
 * @param {HTMLElement} item
 * @returns {boolean}
 */
function itemHasPbnDiagram(item) {
  const el = itemTextEl(item);
  if (!el) return false;
  const text = el.textContent ?? '';
  if (parseDealFromLine(text)) return true;
  const auctionFound = findAuctionInLine(text);
  if (!auctionFound) return false;
  const completeLine =
    !text.slice(0, auctionFound.start).trim() &&
    !text.slice(auctionFound.end).trim();
  if (completeLine) {
    return Boolean(parseAuctionFromItem(item)?.calls?.length);
  }
  return auctionFound.auction.calls.length > 0;
}

/**
 * Count outline lines with a PBN deal or auction to render.
 * @param {HTMLElement} root
 * @returns {number}
 */
export function countDealLinesInRoot(root) {
  if (!root) return 0;
  let n = 0;
  root.querySelectorAll('[data-item]').forEach((item) => {
    if (isDealDiagramItem(item)) return;
    if (itemHasPbnDiagram(item)) n += 1;
  });
  return n;
}

/**
 * @param {HTMLElement} el
 * @param {HTMLElement} diagram
 * @param {string} text
 * @param {number} start
 * @param {number} end
 */
function replaceTextRangeWithDiagram(el, diagram, text, start, end) {
  const before = text.slice(0, start);
  const after = text.slice(end);
  if (!before.trim() && !after.trim()) {
    el.replaceWith(diagram);
    return;
  }
  el.textContent = '';
  el.contentEditable = 'false';
  if (before) el.appendChild(document.createTextNode(before));
  el.appendChild(diagram);
  if (after) el.appendChild(document.createTextNode(after));
}

/**
 * Remove only foldable bid-row children after building a full-line auction diagram.
 * Prose subheadings under the auction line are kept.
 * @param {HTMLElement} item
 */
function clearAuctionChildRows(item) {
  const list = item.querySelector(':scope > ol');
  if (!list) return;
  for (const child of [...list.children]) {
    if (!child.matches?.('[data-item]')) continue;
    const childText =
      child.querySelector(':scope > .row > .text')?.textContent ?? '';
    if (isAuctionCallRow(childText)) child.remove();
  }
  const remaining = [...list.children].filter((el) =>
    el.matches?.('[data-item]'),
  );
  const toggle = item.querySelector(':scope > .row > .toggle');
  if (remaining.length === 0) {
    list.remove();
    item.dataset.hasChildren = 'false';
    if (toggle) {
      toggle.disabled = true;
      toggle.setAttribute('aria-expanded', 'false');
    }
    return;
  }
  item.dataset.hasChildren = 'true';
  if (toggle) {
    toggle.disabled = false;
    toggle.setAttribute('aria-expanded', 'true');
  }
}

/**
 * Replace each PBN deal/auction with its diagram (in place).
 * Surrounding prose on the same line is kept; a dedicated line becomes just the diagram.
 * Only bid-row children are folded/removed when `[Auction]` is the entire line;
 * subheadings stay in the rendered outline.
 * @param {HTMLElement} root
 * @returns {number} number of lines replaced
 */
export function replaceDealLinesWithDiagrams(root) {
  if (!root) return 0;
  let n = 0;
  // Snapshot items first — DOM mutates as we replace.
  const items = [...root.querySelectorAll('[data-item]')].filter(
    (item) => !isDealDiagramItem(item),
  );
  for (const item of items) {
    if (!item.isConnected) continue;
    const el = itemTextEl(item);
    if (!el) continue;
    const text = el.textContent ?? '';

    const dealFound = findDealInLine(text);
    if (dealFound) {
      replaceTextRangeWithDiagram(
        el,
        buildDealDiagramElement(dealFound.deal),
        text,
        dealFound.start,
        dealFound.end,
      );
      n += 1;
      continue;
    }

    const auctionFound = findAuctionInLine(text);
    if (!auctionFound) continue;
    const before = text.slice(0, auctionFound.start);
    const after = text.slice(auctionFound.end);
    const completeLine = !before.trim() && !after.trim();

    if (completeLine) {
      // Whole line is the auction: fold bid-row children into the diagram.
      const auction = parseAuctionFromItem(item);
      if (!auction?.calls?.length) continue;
      clearAuctionChildRows(item);
      el.replaceWith(buildAuctionDiagramElement(auction));
      n += 1;
      continue;
    }

    // Inline auction: same-line calls only; leave child outline rows alone.
    if (!auctionFound.auction.calls.length) continue;
    replaceTextRangeWithDiagram(
      el,
      buildAuctionDiagramElement(auctionFound.auction),
      text,
      auctionFound.start,
      auctionFound.end,
    );
    n += 1;
  }
  return n;
}
