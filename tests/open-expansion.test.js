import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  loadOutline,
  isExpanded,
  hasChildren,
  itemOutlineDepth,
  applyOpenExpansion,
  serializeOutline,
} from '../outliner.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function setupDom() {
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <ol class="outline" data-outline-root></ol>
  </body>`, { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  return document.querySelector('[data-outline-root]');
}

/** Three nesting levels: A → 1 → a (CSS: upper-alpha, arabic, lower-alpha). */
function deepTree() {
  return {
    items: [
      {
        text: 'Alpha',
        expanded: true,
        children: [
          {
            text: 'One',
            expanded: true,
            children: [
              { text: 'aye', expanded: true, children: [] },
              { text: 'bee', expanded: true, children: [] },
            ],
          },
          { text: 'Two', expanded: true, children: [] },
        ],
      },
      {
        text: 'Beta',
        expanded: false,
        children: [
          {
            text: 'Three',
            expanded: true,
            children: [{ text: 'cee', expanded: true, children: [] }],
          },
        ],
      },
    ],
  };
}

describe('open expansion (arabic-numeral level)', () => {
  /** @type {HTMLElement} */
  let root;

  beforeEach(() => {
    root = setupDom();
  });

  it('itemOutlineDepth is 0 for top-level, 1 for arabic children, 2 for lower-alpha', () => {
    loadOutline(root, deepTree());
    const [alpha, one, aye, bee, two, beta, three, cee] = [
      ...root.querySelectorAll('[data-item]'),
    ];
    assert.equal(itemOutlineDepth(alpha, root), 0);
    assert.equal(itemOutlineDepth(one, root), 1);
    assert.equal(itemOutlineDepth(aye, root), 2);
    assert.equal(itemOutlineDepth(bee, root), 2);
    assert.equal(itemOutlineDepth(two, root), 1);
    assert.equal(itemOutlineDepth(beta, root), 0);
    assert.equal(itemOutlineDepth(three, root), 1);
    assert.equal(itemOutlineDepth(cee, root), 2);
  });

  it('applyOpenExpansion expands top-level parents and collapses deeper parents', () => {
    loadOutline(root, deepTree());
    applyOpenExpansion(root);

    const byText = (t) =>
      [...root.querySelectorAll('[data-item]')].find(
        (el) => el.querySelector('.text')?.textContent === t,
      );

    assert.equal(isExpanded(byText('Alpha')), true);
    assert.equal(isExpanded(byText('Beta')), true);
    assert.equal(isExpanded(byText('One')), false);
    assert.equal(isExpanded(byText('Three')), false);
    assert.equal(hasChildren(byText('Two')), false);

    // Arabic-numeral lines are visible under expanded top-level heads.
    assert.equal(byText('One').closest('ol').hidden, false);
    assert.equal(byText('Three').closest('ol').hidden, false);
    // Lower-alpha grandchildren stay hidden under collapsed arabic parents.
    assert.equal(byText('aye').closest('ol').hidden, true);
    assert.equal(byText('cee').closest('ol').hidden, true);
  });

  it('applyOpenExpansion does not change outline text structure', () => {
    loadOutline(root, deepTree());
    const before = serializeOutline(root);
    applyOpenExpansion(root);
    assert.deepEqual(serializeOutline(root), before);
  });

  it('app.js applies open expansion after local, cloud, and deep-link opens', () => {
    const appJs = readFileSync(join(repoRoot, 'app.js'), 'utf8');
    assert.match(appJs, /applyOpenExpansion/);
    assert.match(
      appJs,
      /function applyOpenedLocalOutline[\s\S]*applyOpenExpansion\(root\)/,
    );
    assert.match(
      appJs,
      /loadOutline:\s*\(tree\)\s*=>\s*\{[\s\S]*?applyOpenExpansion\(root\)/,
    );
    assert.match(
      appJs,
      /applyOutline:\s*async\s*\(got\)\s*=>\s*\{[\s\S]*?applyOpenExpansion\(root\)/,
    );
  });

  it('app.js applies open expansion for the starter outline when not deep-linking', () => {
    const appJs = readFileSync(join(repoRoot, 'app.js'), 'utf8');
    assert.match(
      appJs,
      /blankOutlineForDeepLink[\s\S]*?applyOpenExpansion\(root\)|if\s*\(\s*!blankOutlineForDeepLink[\s\S]*?applyOpenExpansion\(root\)/,
    );
  });
});
