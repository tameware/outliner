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

  it('has no Add line toolbar button (Enter adds a line)', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /id="btn-add"/);
    assert.doesNotMatch(html, />Add line</);
    const appJs = readFileSync(join(root, 'app.js'), 'utf8');
    assert.doesNotMatch(appJs, /btn-add/);
  });
});
