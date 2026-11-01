/**
 * Tameware (and any host with script-src 'self') blocks inline module scripts.
 * The page entry must be an external file so CSP allows it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import { parseOpml, loadOutline, mountOutliner } from '../src/outliner/outliner.js';
import { DEFAULT_OUTLINE_OPML } from '../src/outliner/default-outline.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('index.html CSP-safe entry', () => {
  it('loads app logic from an external module script, not an inline module', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(
      html,
      /<script\s+type="module"\s+src="\.\/src\/app\.js"><\/script>/,
      'expected <script type="module" src="./src/app.js"></script>',
    );
    assert.doesNotMatch(
      html,
      /<script\s+type="module">/,
      'inline <script type="module"> is blocked by script-src \'self\'',
    );
    const appJs = readFileSync(join(root, 'src/app.js'), 'utf8');
    assert.match(appJs, /boot\s*\(/);
    assert.match(appJs, /bootCloud/);
  });

  it('starter tip says show or hide children (show before hide)', () => {
    const opml = readFileSync(join(root, 'default-outline.opml'), 'utf8');
    assert.match(opml, /to show or hide its children/);
    assert.doesNotMatch(opml, /to hide or show its children/);
  });

  it('places the expand/collapse tip as item 2 under How to use this outliner', () => {
    const dom = new JSDOM(
      `<!DOCTYPE html><body><ol class="outline" data-outline-root></ol></body>`,
      { url: 'http://localhost/' },
    );
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.DOMParser = dom.window.DOMParser;
    const outline = document.querySelector('[data-outline-root]');
    mountOutliner(outline, { bindEvents: false });
    loadOutline(outline, parseOpml(DEFAULT_OUTLINE_OPML));
    const howTo = [...outline.children].find((el) =>
      /How to use this outliner/.test(
        el.querySelector(':scope > .row .text')?.textContent ?? '',
      ),
    );
    assert.ok(howTo, 'expected How to use this outliner top-level item');
    const kids = [...(howTo.querySelector(':scope > ol')?.children ?? [])].filter(
      (el) => el.matches?.('[data-item]'),
    );
    assert.ok(kids.length >= 2, `expected ≥2 children under How to use, got ${kids.length}`);
    assert.match(
      kids[0].querySelector(':scope > .row .text')?.textContent ?? '',
      /Click any line to edit it/,
    );
    assert.match(
      kids[1].querySelector(':scope > .row .text')?.textContent ?? '',
      /Click ▸ or ▾ beside a parent to show or hide its children/,
    );
    const subheads = [
      ...(kids[1].querySelector(':scope > ol')?.children ?? []),
    ].filter((el) => el.matches?.('[data-item]'));
    assert.equal(subheads.length, 3);
    assert.match(
      subheads[0].querySelector(':scope > .row .text')?.textContent ?? '',
      /^⌘→ \/ ⌘← will do the same$/,
    );
    assert.match(
      subheads[1].querySelector(':scope > .row .text')?.textContent ?? '',
      /^⌘⌥→ expands this heading’s subheads completely$/,
    );
    assert.match(
      subheads[2].querySelector(':scope > .row .text')?.textContent ?? '',
      /^⌘⌥← collapses this heading’s subheads completely$/,
    );
    for (const tip of subheads) {
      assert.doesNotMatch(
        tip.querySelector(':scope > .row .text')?.textContent ?? '',
        /Command|Right-Arrow|Left-Arrow|Ctrl|Option/i,
      );
    }
  });

  it('how-to outline does not mention undo/redo shortcuts', () => {
    const opml = readFileSync(join(root, 'default-outline.opml'), 'utf8');
    assert.match(opml, /How to use this outliner/);
    assert.doesNotMatch(opml, /undo with/i);
    assert.doesNotMatch(opml, /to redo/i);
    assert.doesNotMatch(opml, /⌘Z/);
    assert.doesNotMatch(opml, /Ctrl\+Z/);
    assert.doesNotMatch(opml, /Ctrl\+Y/);
    assert.doesNotMatch(opml, /⇧⌘Z/);
  });

  it('suit tip shows red hearts and diamonds without explaining the color in prose', () => {
    const dom = new JSDOM(
      `<!DOCTYPE html><body><ol class="outline" data-outline-root></ol></body>`,
      { url: 'http://localhost/' },
    );
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.DOMParser = dom.window.DOMParser;
    const outline = document.querySelector('[data-outline-root]');
    mountOutliner(outline, { bindEvents: false });
    loadOutline(outline, parseOpml(DEFAULT_OUTLINE_OPML));
    const tip = [...outline.querySelectorAll('.text')].find((el) =>
      /!c !d !h !s/.test(el.textContent),
    );
    assert.ok(tip, 'expected !c !d !h !s tip');
    assert.match(tip.innerHTML, /<span class="suit suit-red"[^>]*>♦<\/span>/);
    assert.match(tip.innerHTML, /<span class="suit suit-red"[^>]*>♥<\/span>/);
    assert.match(tip.innerHTML, /contenteditable="false"/);
    assert.doesNotMatch(tip.textContent, /red for hearts/i);
  });

  it('has no Add line toolbar button (Enter adds a line)', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /id="btn-add"/);
    assert.doesNotMatch(html, />Add line</);
    const appJs = readFileSync(join(root, 'src/app.js'), 'utf8');
    assert.doesNotMatch(appJs, /btn-add/);
  });

  it('shows Tameware Outliner as the page heading', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(html, /<h1>Tameware Outliner<\/h1>/);
  });

  it('blanks the starter outline on deep-link boot', () => {
    const appJs = readFileSync(join(root, 'src/app.js'), 'utf8');
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
    assert.match(filePanel, /id="menu-file-save-as"/);
    assert.match(filePanel, /id="menu-revert"/);
    assert.match(html, /id="menu-insert-import"/);
    assert.match(filePanel, /id="menu-insert-import"[^>]*>\s*Insert…\s*</);
    assert.doesNotMatch(filePanel, /Insert Import/);
    assert.doesNotMatch(filePanel, /id="menu-import"/);
    assert.doesNotMatch(filePanel, /id="menu-export"/);
    assert.ok(
      filePanel.indexOf('id="menu-file-open"') < filePanel.indexOf('id="menu-insert-import"') &&
        filePanel.indexOf('id="menu-insert-import"') < filePanel.indexOf('id="menu-file-save"') &&
        filePanel.indexOf('id="menu-file-save"') < filePanel.indexOf('id="menu-file-save-as"'),
      'File order should be Open, Insert, Save, Save As',
    );
    assert.match(html, /id="menu-cloud-auth"/);
    assert.match(html, /id="menu-cloud-share"/);
    assert.match(html, /id="menu-cloud-share-edit"/);
    assert.doesNotMatch(html, /id="btn-sign-in"/);
    assert.doesNotMatch(html, /id="btn-cloud-share"/);
  });

  it('wires File Insert… through insertOutline without replacing the outline', () => {
    const appJs = readFileSync(join(root, 'src/app.js'), 'utf8');
    const localSessionJs = readFileSync(
      join(root, 'src/file/local-session.js'),
      'utf8',
    );
    assert.match(appJs, /menu-insert-import/);
    assert.match(appJs, /insertOutline/);
    assert.match(localSessionJs, /triggerLegacyFileOpen\(['"]insert['"]\)/);
    assert.match(localSessionJs, /mode === 'insert'/);
  });

  it('wires Drive Insert… through outline.insertOutline', () => {
    const appJs = readFileSync(join(root, 'src/app.js'), 'utf8');
    const cloudUi = readFileSync(join(root, 'src/cloud/cloud-ui.js'), 'utf8');
    assert.match(appJs, /insertOutline:\s*\(tree\)\s*=>/);
    assert.match(cloudUi, /menu-insert/);
    assert.match(cloudUi, /insertOutline/);
    assert.match(cloudUi, /Insert from Google Drive/);
  });

  it('wires File and Cloud Revert to the same revert handler', () => {
    const appJs = readFileSync(join(root, 'src/app.js'), 'utf8');
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
    assert.match(html, /id="find-replace-whole"/);
    const appJs = readFileSync(join(root, 'src/app.js'), 'utf8');
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
