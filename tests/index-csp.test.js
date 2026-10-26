/**
 * Tameware (and any host with script-src 'self') blocks inline module scripts.
 * The page entry must be an external file so CSP allows it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('index.html CSP-safe entry', () => {
  it('loads app logic from an external module script, not an inline module', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(
      html,
      /<script\s+type="module"\s+src="\.\/app\.js"><\/script>/,
      'expected <script type="module" src="./app.js"></script>',
    );
    assert.doesNotMatch(
      html,
      /<script\s+type="module">/,
      'inline <script type="module"> is blocked by script-src \'self\'',
    );
    const appJs = readFileSync(join(root, 'app.js'), 'utf8');
    assert.match(appJs, /boot\s*\(/);
    assert.match(appJs, /initCloud|loadCloudConfig/);
  });

  it('starter tip says show or hide children (show before hide)', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(html, /to show or hide its children/);
    assert.doesNotMatch(html, /to hide or show its children/);
  });

  it('how-to outline does not mention undo/redo shortcuts', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const tips = [...html.matchAll(/class="text" contenteditable="true">([^<]*)</g)].map(
      (m) => m[1],
    );
    assert.ok(tips.some((t) => /How to use this outliner/.test(t)));
    for (const tip of tips) {
      assert.doesNotMatch(tip, /undo with/i);
      assert.doesNotMatch(tip, /to redo/i);
      assert.doesNotMatch(tip, /⌘Z/);
      assert.doesNotMatch(tip, /Ctrl\+Z/);
      assert.doesNotMatch(tip, /Ctrl\+Y/);
      assert.doesNotMatch(tip, /⇧⌘Z/);
    }
  });

  it('suit tip shows red hearts and diamonds without explaining the color in prose', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const tip = html.match(
      /class="text" contenteditable="true">(!c !d !h !s[\s\S]*?)<\/div>/,
    )?.[1];
    assert.ok(tip, 'expected !c !d !h !s tip');
    assert.match(tip, /<span class="suit suit-red">♦<\/span>/);
    assert.match(tip, /<span class="suit suit-red">♥<\/span>/);
    assert.doesNotMatch(tip, /red for hearts/i);
  });

  it('has no Add line toolbar button (Enter adds a line)', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /id="btn-add"/);
    assert.doesNotMatch(html, />Add line</);
    const appJs = readFileSync(join(root, 'app.js'), 'utf8');
    assert.doesNotMatch(appJs, /btn-add/);
  });

  it('shows Tameware Outliner as the page heading', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(html, /<h1>Tameware Outliner<\/h1>/);
  });

  it('blanks the starter outline on deep-link boot', () => {
    const appJs = readFileSync(join(root, 'app.js'), 'utf8');
    assert.match(appJs, /blankOutlineForDeepLink/);
  });

  it('provides File, Edit, and View dropdown menus', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(html, /data-menu="file"/);
    assert.match(html, /data-menu="edit"/);
    assert.match(html, /data-menu="view"/);
    assert.match(html, /class="menu-label"/);
    assert.doesNotMatch(html, /<details/);
    assert.match(html, /id="menu-save"/);
    assert.match(html, /id="menu-save-as"/);
    assert.match(html, /id="menu-revert"/);
    assert.match(html, /id="menu-import"/);
    assert.match(html, /id="menu-export"/);
  });
});
