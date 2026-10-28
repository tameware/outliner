import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  OUTLINER_ABOUT_TEXT,
  OUTLINER_ISSUES_MAILTO,
  OUTLINER_REPO_URL,
  OUTLINER_VERSION,
  mountOutlinerMenu,
} from '../outliner-menu.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function setupDom() {
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <nav class="menubar">
      <div class="menu" data-menu="outliner">
        <button type="button" class="menu-label">Outliner</button>
        <div class="menu-panel" role="menu">
          <button type="button" role="menuitem" id="menu-about">About</button>
          <button type="button" role="menuitem" id="menu-version">Version</button>
          <button type="button" role="menuitem" id="menu-open-source">Open-Source Repository</button>
          <button type="button" role="menuitem" id="menu-report-issues">Report issues</button>
        </div>
      </div>
    </nav>
  </body>`);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  return dom;
}

describe('Outliner menu', () => {
  /** @type {string[]} */
  let alerts;
  /** @type {string[]} */
  let opened;

  beforeEach(() => {
    setupDom();
    alerts = [];
    opened = [];
    window.alert = (msg) => {
      alerts.push(String(msg));
    };
    window.open = (url) => {
      opened.push(String(url));
      return null;
    };
  });

  it('exports version matching package.json and known repo/mailto targets', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert.equal(OUTLINER_VERSION, pkg.version);
    assert.equal(OUTLINER_REPO_URL, 'https://github.com/tameware/outliner');
    assert.equal(OUTLINER_ISSUES_MAILTO, 'mailto:outliner@tameware.com');
    assert.match(OUTLINER_ABOUT_TEXT, /Tameware Outliner/i);
  });

  it('shows About text and Version on click', () => {
    mountOutlinerMenu(document);
    document.getElementById('menu-about').click();
    document.getElementById('menu-version').click();
    assert.deepEqual(alerts, [OUTLINER_ABOUT_TEXT, OUTLINER_VERSION]);
  });

  it('opens the GitHub repository URL', () => {
    mountOutlinerMenu(document);
    document.getElementById('menu-open-source').click();
    assert.deepEqual(opened, [OUTLINER_REPO_URL]);
  });

  it('opens the Report issues mailto', () => {
    mountOutlinerMenu(document);
    document.getElementById('menu-report-issues').click();
    assert.deepEqual(opened, [OUTLINER_ISSUES_MAILTO]);
  });

  it('places Outliner left of File in index.html with the four items', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const outlinerAt = html.indexOf('data-menu="outliner"');
    const fileAt = html.indexOf('data-menu="file"');
    assert.ok(outlinerAt >= 0);
    assert.ok(fileAt > outlinerAt);

    const panel = html.slice(outlinerAt, fileAt);
    assert.match(panel, /id="menu-about"[^>]*>\s*About\s*</);
    assert.match(panel, /id="menu-version"[^>]*>\s*Version\s*</);
    assert.match(panel, /id="menu-open-source"[^>]*>\s*Open-Source Repository\s*</);
    assert.match(panel, /id="menu-report-issues"[^>]*>\s*Report issues\s*</);
  });

  it('wires mountOutlinerMenu from app.js', () => {
    const appJs = readFileSync(join(root, 'app.js'), 'utf8');
    assert.match(appJs, /mountOutlinerMenu/);
    assert.match(appJs, /from ['"]\.\/outliner-menu\.js['"]/);
  });
});
