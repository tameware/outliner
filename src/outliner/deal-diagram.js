/**
 * Detect PBN-style bridge deals and build compass diagrams for render views.
 */

import { SUIT_GLYPHS, createSuitNode } from './suit-shortcuts.js';

const RANK = 'AKQJT98765432';
const SUIT_PART = `(?:[${RANK}]*|-)`;
const HAND_RE = new RegExp(
  `${SUIT_PART}\\.${SUIT_PART}\\.${SUIT_PART}\\.${SUIT_PART}`,
  'i',
);
const HAND_SRC = HAND_RE.source;
const DEAL_BODY_RE = new RegExp(
  `^(?:([NESW]):)?\\s*(${HAND_SRC})\\s+(${HAND_SRC})\\s+(${HAND_SRC})\\s+(${HAND_SRC})\\s*$`,
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
 * @param {string} line
 * @returns {{ hands: Record<'N'|'E'|'S'|'W', { spades: string, hearts: string, diamonds: string, clubs: string }> } | null}
 */
export function parseDealFromLine(line) {
  let raw = String(line ?? '').trim();
  if (!raw) return null;

  const tagged = raw.match(DEAL_TAG_RE);
  if (tagged) raw = tagged[1].trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    raw = raw.slice(1, -1).trim();
  }

  const m = raw.match(DEAL_BODY_RE);
  if (!m) return null;

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
 * Legacy child-diagram marker (no longer created; kept for OPML/search filters).
 * @param {HTMLElement | null | undefined} item
 */
export function isDealDiagramItem(item) {
  return item?.dataset?.dealDiagram === 'true';
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
  wrap.appendChild(buildHandEl(deal.hands.N, 'deal-north'));
  const mid = document.createElement('div');
  mid.className = 'deal-mid';
  mid.appendChild(buildHandEl(deal.hands.W, 'deal-west'));
  mid.appendChild(buildHandEl(deal.hands.E, 'deal-east'));
  wrap.appendChild(mid);
  wrap.appendChild(buildHandEl(deal.hands.S, 'deal-south'));
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
 * Count outline lines whose text parses as a PBN deal.
 * @param {HTMLElement} root
 * @returns {number}
 */
export function countDealLinesInRoot(root) {
  if (!root) return 0;
  let n = 0;
  root.querySelectorAll('[data-item]').forEach((item) => {
    if (isDealDiagramItem(item)) return;
    const el = itemTextEl(item);
    if (!el) return;
    if (parseDealFromLine(el.textContent ?? '')) n += 1;
  });
  return n;
}

/**
 * Replace each deal line’s `.text` with a compass diagram (in place).
 * @param {HTMLElement} root
 * @returns {number} number of lines replaced
 */
export function replaceDealLinesWithDiagrams(root) {
  if (!root) return 0;
  let n = 0;
  root.querySelectorAll('[data-item]').forEach((item) => {
    if (isDealDiagramItem(item)) return;
    const el = itemTextEl(item);
    if (!el) return;
    const deal = parseDealFromLine(el.textContent ?? '');
    if (!deal) return;
    el.replaceWith(buildDealDiagramElement(deal));
    n += 1;
  });
  return n;
}
