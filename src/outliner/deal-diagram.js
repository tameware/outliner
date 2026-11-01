/**
 * Detect PBN-style bridge deals in a line and render a compass diagram child.
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
 * @param {{ hands: Record<'N'|'E'|'S'|'W', { spades: string, hearts: string, diamonds: string, clubs: string }> }} deal
 * @returns {HTMLElement}
 */
export function createDealDiagramItem(deal) {
  const li = document.createElement('li');
  li.dataset.item = '';
  li.dataset.dealDiagram = 'true';
  li.dataset.state = 'expanded';
  li.dataset.hasChildren = 'false';

  const row = document.createElement('div');
  row.className = 'row deal-diagram-row';
  row.appendChild(buildDealDiagramElement(deal));
  li.appendChild(row);
  return li;
}

function childList(item) {
  return item.querySelector(':scope > ol');
}

function ensureChildList(item) {
  let list = childList(item);
  if (!list) {
    list = document.createElement('ol');
    item.appendChild(list);
  }
  return list;
}

function directChildItems(item) {
  const list = childList(item);
  if (!list) return [];
  return [...list.children].filter((el) => el.matches('[data-item]'));
}

function findDiagramChild(item) {
  return directChildItems(item).find((el) => isDealDiagramItem(el)) ?? null;
}

function getItemText(item) {
  const el = item.querySelector(':scope > .row > .text');
  return el ? el.textContent : '';
}

function syncItemMeta(item) {
  const kids = directChildItems(item).length > 0;
  item.dataset.hasChildren = kids ? 'true' : 'false';
  const btn = item.querySelector(':scope > .row > .toggle');
  if (btn) {
    btn.disabled = !kids;
    btn.setAttribute(
      'aria-expanded',
      kids && item.dataset.state !== 'collapsed' ? 'true' : 'false',
    );
  }
}

/**
 * Ensure `item` has a deal-diagram child iff its text is a deal.
 * @param {HTMLElement} item
 * @returns {boolean} true when a diagram is present afterward
 */
export function syncDealDiagram(item) {
  if (!item || isDealDiagramItem(item)) return false;
  const deal = parseDealFromLine(getItemText(item));
  const existing = findDiagramChild(item);

  if (!deal) {
    if (existing) {
      existing.remove();
      const list = childList(item);
      if (list && list.children.length === 0) list.remove();
      syncItemMeta(item);
    }
    return false;
  }

  const next = createDealDiagramItem(deal);
  const list = ensureChildList(item);
  if (existing) existing.replaceWith(next);
  else list.insertBefore(next, list.firstChild);
  item.dataset.state = 'expanded';
  list.hidden = false;
  syncItemMeta(item);
  return true;
}

/**
 * Sync deal diagrams for every non-diagram item under root.
 * @param {HTMLElement} root
 */
export function syncAllDealDiagrams(root) {
  if (!root) return;
  root.querySelectorAll('[data-item]').forEach((item) => {
    if (!isDealDiagramItem(item)) syncDealDiagram(item);
  });
}

/**
 * @param {HTMLElement} root
 */
export function bindDealDiagrams(root) {
  if (!root) return () => {};
  function onFocusOut(event) {
    const text = event.target?.closest?.('.text');
    if (!text || !root.contains(text)) return;
    const item = text.closest('[data-item]');
    if (!item || isDealDiagramItem(item)) return;
    queueMicrotask(() => {
      if (item.isConnected) syncDealDiagram(item);
    });
  }
  root.addEventListener('focusout', onFocusOut);
  syncAllDealDiagrams(root);
  return () => root.removeEventListener('focusout', onFocusOut);
}
