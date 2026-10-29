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

  it('provides Outliner, File, Edit, View, and Cloud dropdown menus', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(html, /data-menu="outliner"/);
    assert.match(html, /data-menu="file"/);
    assert.match(html, /data-menu="edit"/);
    assert.match(html, /data-menu="view"/);
    assert.match(html, /data-menu="cloud"/);
    assert.ok(html.indexOf('data-menu="outliner"') < html.indexOf('data-menu="file"'));
    assert.ok(html.indexOf('data-menu="view"') < html.indexOf('data-menu="cloud"'));
    assert.match(html, /class="menu-label"/);
    assert.doesNotMatch(html, /<details/);
    assert.match(html, /id="menu-save"/);
    assert.match(html, /id="menu-save-as"/);
    assert.match(html, /id="menu-revert"/);
    assert.match(html, /id="menu-insert"/);
    assert.match(html, />Insert…</);
    const fileAt = html.indexOf('data-menu="file"');
    const editAt = html.indexOf('data-menu="edit"');
    const cloudAt = html.indexOf('data-menu="cloud"');
    const filePanel = html.slice(fileAt, editAt);
    const cloudPanel = html.slice(cloudAt);
    assert.match(cloudPanel, /id="menu-open"/);
    assert.match(cloudPanel, /id="menu-insert"/);
    assert.match(cloudPanel, /id="menu-save"/);
    assert.match(cloudPanel, /id="menu-save-as"/);
    assert.match(cloudPanel, /id="menu-delete"/);
    assert.match(cloudPanel, /id="menu-cloud-revert"/);
    assert.doesNotMatch(filePanel, /id="menu-open"/);
    assert.doesNotMatch(filePanel, /id="menu-save"/);
    assert.ok(
      cloudPanel.indexOf('id="menu-open"') < cloudPanel.indexOf('id="menu-insert"') &&
        cloudPanel.indexOf('id="menu-insert"') < cloudPanel.indexOf('id="menu-save"'),
      'Insert… should sit between Open and Save in Cloud',
    );
    assert.ok(
      cloudPanel.indexOf('id="menu-delete"') < cloudPanel.indexOf('id="menu-cloud-revert"') &&
        cloudPanel.indexOf('id="menu-cloud-revert"') < cloudPanel.indexOf('id="menu-cloud-share"'),
      'Cloud Revert should sit between Delete and share links',
    );
    assert.match(filePanel, /id="menu-file-open"/);
    assert.match(filePanel, /id="menu-file-save"/);
    assert.match(filePanel, /id="menu-revert"/);
    assert.match(html, /id="menu-insert-import"/);
    assert.match(html, /Insert Import…/);
    assert.doesNotMatch(filePanel, /id="menu-import"/);
    assert.doesNotMatch(filePanel, /id="menu-export"/);
    assert.ok(
      filePanel.indexOf('id="menu-file-open"') < filePanel.indexOf('id="menu-file-save"') &&
        filePanel.indexOf('id="menu-file-save"') < filePanel.indexOf('id="menu-insert-import"'),
      'File Open / Save should sit above Insert Import…',
    );
    assert.match(html, /id="menu-cloud-auth"/);
    assert.match(html, /id="menu-cloud-share"/);
    assert.match(html, /id="menu-cloud-share-edit"/);
    assert.doesNotMatch(html, /id="btn-sign-in"/);
    assert.doesNotMatch(html, /id="btn-cloud-share"/);
  });

  it('wires Insert Import through insertOutline without replacing the outline', () => {
    const appJs = readFileSync(join(root, 'app.js'), 'utf8');
    assert.match(appJs, /menu-insert-import/);
    assert.match(appJs, /insertOutline/);
    assert.match(appJs, /triggerLegacyFileOpen\(['"]insert['"]\)/);
    assert.match(appJs, /mode === 'insert'/);
  });

  it('wires Drive Insert… through outline.insertOutline', () => {
    const appJs = readFileSync(join(root, 'app.js'), 'utf8');
    const cloudUi = readFileSync(join(root, 'cloud-ui.js'), 'utf8');
    assert.match(appJs, /insertOutline:\s*\(tree\)\s*=>/);
    assert.match(cloudUi, /menu-insert/);
    assert.match(cloudUi, /insertOutline/);
    assert.match(cloudUi, /Insert from Google Drive/);
  });

  it('wires File and Cloud Revert to the same revert handler', () => {
    const appJs = readFileSync(join(root, 'app.js'), 'utf8');
    assert.match(appJs, /menu-cloud-revert/);
    assert.match(appJs, /function onRevert\b/);
    assert.match(appJs, /getElementById\('menu-revert'\)[\s\S]*?onRevert/);
    assert.match(appJs, /getElementById\('menu-cloud-revert'\)[\s\S]*?onRevert/);
  });

  it('includes Find & Replace dialog and Edit menu items', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(html, /id="menu-find"/);
    assert.match(html, /id="menu-replace"/);
    assert.match(html, /id="find-replace-dialog"/);
    assert.match(html, /id="find-replace-grep"/);
    const appJs = readFileSync(join(root, 'app.js'), 'utf8');
    assert.match(appJs, /mountFindReplace/);
  });

  it('links to a privacy policy page from the Outliner menu', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(html, /id="menu-privacy"[^>]*>\s*Privacy\s*</);
    assert.doesNotMatch(html, /chrome-privacy/);
    const privacy = readFileSync(join(root, 'privacy.html'), 'utf8');
    assert.match(privacy, /Privacy Policy/i);
    assert.match(privacy, /Google Drive/i);
    assert.match(privacy, /drive\.file/);
  });
});
