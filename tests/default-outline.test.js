import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import { parseOpml, loadOutline, mountOutliner, getItemText } from '../src/outliner/outliner.js';
import { DEFAULT_OUTLINE_OPML } from '../src/outliner/default-outline.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('default outline OPML + generated JS', () => {
  it('keeps the canonical starter in default-outline.opml', () => {
    const opmlPath = join(repoRoot, 'default-outline.opml');
    assert.equal(existsSync(opmlPath), true);
    const opml = readFileSync(opmlPath, 'utf8');
    assert.match(opml, /<title>Getting Started<\/title>/);
    assert.match(opml, /to show or hide its children/);
    assert.doesNotMatch(opml, /to hide or show its children/);
    assert.match(opml, /!c !d !h !s — insert ♣ ♦ ♥ ♠/);
  });

  it('copies the OPML into default-outline.js at build time', () => {
    const script = join(repoRoot, 'scripts/build-default-outline.js');
    assert.equal(existsSync(script), true);
    const before = readFileSync(join(repoRoot, 'src/outliner/default-outline.js'), 'utf8');
    execFileSync(process.execPath, [script], { cwd: repoRoot });
    const after = readFileSync(join(repoRoot, 'src/outliner/default-outline.js'), 'utf8');
    assert.equal(after, before, 'default-outline.js should match a fresh build');
    assert.match(after, /export const DEFAULT_OUTLINE_OPML/);
    assert.match(after, /How to use this outliner/);
    assert.equal(DEFAULT_OUTLINE_OPML, readFileSync(join(repoRoot, 'default-outline.opml'), 'utf8'));
  });

  it('index.html does not bake the starter outline tree', () => {
    const html = readFileSync(join(repoRoot, 'index.html'), 'utf8');
    assert.match(html, /data-outline-root/);
    assert.doesNotMatch(html, /How to use this outliner<\/div>/);
    assert.doesNotMatch(html, /to show or hide its children/);
  });

  it('package.json build regenerates default-outline.js', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    assert.match(pkg.scripts.build, /build-default-outline/);
    assert.match(pkg.scripts.pretest || '', /build|npm run build/);
  });

  it('loads the generated OPML into the outline root with red suits wrapped', () => {
    const dom = new JSDOM(
      `<!DOCTYPE html><body><ol class="outline" data-outline-root></ol></body>`,
      { url: 'http://localhost/' },
    );
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.DOMParser = dom.window.DOMParser;
    const root = document.querySelector('[data-outline-root]');
    mountOutliner(root, { bindEvents: false });
    loadOutline(root, parseOpml(DEFAULT_OUTLINE_OPML));
    const howTo = root.querySelector('[data-item]');
    assert.equal(getItemText(howTo), 'How to use this outliner');
    const tip = [...root.querySelectorAll('.text')].find((el) =>
      el.textContent.includes('!c !d !h !s'),
    );
    assert.ok(tip);
    assert.equal(tip.querySelectorAll('.suit-red').length, 2);
  });
});
