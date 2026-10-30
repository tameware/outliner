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

/** Two top-level heads, each with nested children. */
function multiTopTree() {
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

/** Single top-level head with second- and third-level children. */
function singleTopTree() {
  return {
    items: [
      {
        text: 'Alpha',
        expanded: false,
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
    ],
  };
}

function byText(root, t) {
  return [...root.querySelectorAll('[data-item]')].find(
    (el) => el.querySelector('.text')?.textContent === t,
  );
}

describe('open expansion', () => {
  /** @type {HTMLElement} */
  let root;

  beforeEach(() => {
    root = setupDom();
  });

  it('itemOutlineDepth is 0 for top-level, 1 for arabic children, 2 for lower-alpha', () => {
    loadOutline(root, multiTopTree());
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

  it('with multiple top-level headlines, shows only the top level', () => {
    loadOutline(root, multiTopTree());
    applyOpenExpansion(root);

    assert.equal(isExpanded(byText(root, 'Alpha')), false);
    assert.equal(isExpanded(byText(root, 'Beta')), false);
    assert.equal(byText(root, 'One').closest('ol').hidden, true);
    assert.equal(byText(root, 'Three').closest('ol').hidden, true);
  });

  it('with a single top-level headline, shows all second-level headlines', () => {
    loadOutline(root, singleTopTree());
    applyOpenExpansion(root);

    assert.equal(isExpanded(byText(root, 'Alpha')), true);
    assert.equal(byText(root, 'One').closest('ol').hidden, false);
    assert.equal(byText(root, 'Two').closest('ol').hidden, false);
    // Third level stays collapsed under second-level parents.
    assert.equal(isExpanded(byText(root, 'One')), false);
    assert.equal(byText(root, 'aye').closest('ol').hidden, true);
    assert.equal(hasChildren(byText(root, 'Two')), false);
  });

  it('applyOpenExpansion does not change outline text structure', () => {
    loadOutline(root, multiTopTree());
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

  it('cloud loadOutline does not reuse a stale documentUpdatedAt for Updated', () => {
    const appJs = readFileSync(join(repoRoot, 'app.js'), 'utf8');
    assert.match(
      appJs,
      /loadOutline:\s*\(tree\)\s*=>\s*\{[\s\S]*?applyDocumentUpdated\(tree\.dateModified\s*\?\?\s*null\)/,
    );
    assert.doesNotMatch(
      appJs,
      /loadOutline:\s*\(tree\)\s*=>\s*\{[\s\S]*?applyDocumentUpdated\(tree\.dateModified\s*\?\?\s*documentUpdatedAt\)/,
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
