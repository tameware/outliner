import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  mountOutliner,
  serializeOutline,
  toggleItem,
  toOpml,
  parseOpml,
  loadOutline,
} from '../outliner.js';

function setupDom(html) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`, {
    url: 'http://localhost/',
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.XMLSerializer = dom.window.XMLSerializer;
  return dom;
}

function fixtureOutline() {
  return `
    <ol class="outline" data-outline-root>
      <li data-item data-state="expanded">
        <div class="row">
          <button type="button" class="toggle" aria-label="Toggle"></button>
          <div class="text" contenteditable="true">Alpha</div>
        </div>
        <ol>
          <li data-item data-state="collapsed">
            <div class="row">
              <button type="button" class="toggle" aria-label="Toggle"></button>
              <div class="text" contenteditable="true">Beta</div>
            </div>
            <ol>
              <li data-item>
                <div class="row">
                  <button type="button" class="toggle" aria-label="Toggle"></button>
                  <div class="text" contenteditable="true">Gamma &amp; more</div>
                </div>
              </li>
            </ol>
          </li>
        </ol>
      </li>
      <li data-item>
        <div class="row">
          <button type="button" class="toggle" aria-label="Toggle"></button>
          <div class="text" contenteditable="true">Epsilon</div>
        </div>
      </li>
    </ol>
  `;
}

describe('OPML save and restore', () => {
  let root;

  beforeEach(() => {
    setupDom(fixtureOutline());
    root = document.querySelector('[data-outline-root]');
    mountOutliner(root);
  });

  it('exports OPML with nested outlines and escaped text', () => {
    const xml = toOpml(root, { title: 'Test Outline' });
    assert.match(xml, /<\?xml version="1\.0"/);
    assert.match(xml, /<opml version="2\.0">/);
    assert.match(xml, /<title>Test Outline<\/title>/);
    assert.match(xml, /text="Alpha"/);
    assert.match(xml, /text="Beta"/);
    assert.match(xml, /text="Gamma &amp; more"/);
    assert.match(xml, /text="Epsilon"/);
    // Beta is nested under Alpha
    assert.match(xml, /text="Alpha"[^>]*>[\s\S]*text="Beta"/);
  });

  it('records expansionState for expanded parents', () => {
    const xml = toOpml(root);
    // Document order: 1 Alpha (expanded), 2 Beta (collapsed), 3 Gamma, 4 Epsilon
    // Only Alpha (1) should be in expansionState among parents that are expanded
    assert.match(xml, /<expansionState>1<\/expansionState>/);
  });

  it('can omit expansionState for content-only snapshots used by dirty tracking', () => {
    const before = toOpml(root, { title: 'T', includeExpansionState: false });
    assert.match(before, /<expansionState><\/expansionState>/);
    const fullBefore = toOpml(root, { title: 'T' });
    assert.notEqual(fullBefore, before);
    toggleItem(root.querySelector('[data-item]'));
    const after = toOpml(root, { title: 'T', includeExpansionState: false });
    assert.equal(after, before);
    assert.notEqual(toOpml(root, { title: 'T' }), fullBefore);
  });

  it('parses OPML back into a tree preserving hierarchy and text', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0">
        <head><title>Demo</title><expansionState>1</expansionState></head>
        <body>
          <outline text="Alpha">
            <outline text="Beta">
              <outline text="Gamma &amp; more"/>
            </outline>
          </outline>
          <outline text="Epsilon"/>
        </body>
      </opml>`;
    const tree = parseOpml(xml);
    assert.equal(tree.title, 'Demo');
    assert.deepEqual(
      tree.items.map((n) => ({ text: n.text, childTexts: n.children.map((c) => c.text) })),
      [
        { text: 'Alpha', childTexts: ['Beta'] },
        { text: 'Epsilon', childTexts: [] },
      ],
    );
    assert.equal(tree.items[0].expanded, true);
    assert.equal(tree.items[0].children[0].expanded, false);
    assert.equal(tree.items[0].children[0].children[0].text, 'Gamma & more');
  });

  it('round-trips through OPML including collapse state', () => {
    const xml = toOpml(root, { title: 'Round trip' });
    loadOutline(root, parseOpml(xml));
    mountOutliner(root, { bindEvents: false });

    assert.deepEqual(serializeOutline(root), [
      {
        text: 'Alpha',
        children: [{ text: 'Beta', children: [{ text: 'Gamma & more', children: [] }] }],
      },
      { text: 'Epsilon', children: [] },
    ]);

    const items = [...root.querySelectorAll('[data-item]')];
    assert.equal(items[0].dataset.state, 'expanded'); // Alpha
    assert.equal(items[1].dataset.state, 'collapsed'); // Beta
    assert.equal(items[1].querySelector(':scope > ol').hidden, true);
  });

  it('loadOutline replaces existing outline content', () => {
    loadOutline(root, {
      title: 'New',
      items: [{ text: 'Only', children: [], expanded: true }],
    });
    assert.deepEqual(serializeOutline(root), [
      { text: 'Only', children: [] },
    ]);
  });

  it('round-trips red hearts and diamonds through OPML', () => {
    loadOutline(root, {
      title: 'Suits',
      items: [
        {
          text: `AK♥ vs ♦`,
          children: [],
          expanded: true,
        },
      ],
    });
    const before = root.querySelector('.text');
    assert.deepEqual(
      [...before.querySelectorAll('.suit-red')].map((n) => n.textContent),
      ['♥', '♦'],
    );

    const xml = toOpml(root, { title: 'Suits' });
    loadOutline(root, parseOpml(xml));
    const after = root.querySelector('.text');
    assert.equal(after.textContent, 'AK♥ vs ♦');
    assert.deepEqual(
      [...after.querySelectorAll('.suit-red')].map((n) => n.textContent),
      ['♥', '♦'],
    );
  });
});
