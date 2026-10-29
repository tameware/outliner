import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  OUTLINER_ABOUT_TEXT,
  OUTLINER_CHANGELOG_URL,
  OUTLINER_ISSUES_MAILTO,
  OUTLINER_PRIVACY_URL,
  OUTLINER_REPO_URL,
  OUTLINER_UPDATED,
  OUTLINER_VERSION,
  outlinerVersionLabel,
  mountOutlinerMenu,
} from '../outliner-menu.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function setupDom() {
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <nav class="menubar">
      <div class="menu" data-menu="outliner">
        <button type="button" class="menu-label">Outliner</button>
        <div class="menu-panel" role="menu">
          <button type="button" role="menuitem" id="menu-about">About…</button>
          <button type="button" role="menuitem" id="menu-version">Version…</button>
          <button type="button" role="menuitem" id="menu-changelog">Change log</button>
          <button type="button" role="menuitem" id="menu-open-source">Source code</button>
          <button type="button" role="menuitem" id="menu-report-issues">Report issues</button>
          <button type="button" role="menuitem" id="menu-privacy">Privacy</button>
        </div>
      </div>
    </nav>
    <dialog id="outliner-message-dialog" class="cloud-dialog">
      <form method="dialog" class="cloud-dialog-form">
        <h2 id="outliner-message-title"></h2>
        <p id="outliner-message-body" class="cloud-share-hint"></p>
        <div class="cloud-dialog-actions">
          <button type="submit" id="outliner-message-ok" autofocus>OK</button>
        </div>
      </form>
    </dialog>
  </body>`);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const dialog = document.getElementById('outliner-message-dialog');
  dialog.showModal = () => dialog.setAttribute('open', '');
  dialog.close = () => dialog.removeAttribute('open');
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

  it('exports one-decimal version, update date, and known repo/mailto targets', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const majorMinor = pkg.version.split('.').slice(0, 2).join('.');
    assert.match(OUTLINER_VERSION, /^\d+\.\d+$/);
    assert.equal(OUTLINER_VERSION, majorMinor);
    assert.match(OUTLINER_UPDATED, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(
      outlinerVersionLabel(),
      `${OUTLINER_VERSION} (updated ${OUTLINER_UPDATED})`,
    );
    assert.equal(OUTLINER_CHANGELOG_URL, 'changelog.html');
    assert.equal(OUTLINER_PRIVACY_URL, 'privacy.html');
    assert.equal(OUTLINER_REPO_URL, 'https://github.com/tameware/outliner');
    assert.equal(OUTLINER_ISSUES_MAILTO, 'mailto:outliner@tameware.com');
    assert.equal(
      OUTLINER_ABOUT_TEXT,
      'Tameware Outliner is a WYSIWYG HTML outliner with expand/collapse editing, OPML import/export, optional Google Drive sync, and special features for bridge players. It was written by Adam Wildavsky using Cursor AI.',
    );
  });

  it('shows About and Version in an in-app dialog (not window.alert)', () => {
    mountOutlinerMenu(document);
    const dialog = document.getElementById('outliner-message-dialog');
    const title = document.getElementById('outliner-message-title');
    const body = document.getElementById('outliner-message-body');

    document.getElementById('menu-about').click();
    assert.ok(dialog.hasAttribute('open'));
    assert.equal(title.textContent, 'About');
    assert.equal(body.textContent, OUTLINER_ABOUT_TEXT);
    assert.deepEqual(alerts, []);

    document.getElementById('outliner-message-ok').click();
    assert.equal(dialog.hasAttribute('open'), false);

    document.getElementById('menu-version').click();
    assert.ok(dialog.hasAttribute('open'));
    assert.equal(title.textContent, 'Version');
    assert.equal(body.textContent, outlinerVersionLabel());
    assert.match(
      body.textContent,
      new RegExp(`^${OUTLINER_VERSION.replace('.', '\\.')} \\(updated \\d{4}-\\d{2}-\\d{2}\\)$`),
    );
    assert.deepEqual(alerts, []);
  });

  it('still shows About/Version when window.alert is a no-op (Cursor browser)', () => {
    window.alert = () => {};
    mountOutlinerMenu(document);
    document.getElementById('menu-about').click();
    assert.ok(document.getElementById('outliner-message-dialog').hasAttribute('open'));
    assert.equal(
      document.getElementById('outliner-message-body').textContent,
      OUTLINER_ABOUT_TEXT,
    );
  });

  it('opens the Change Log page', () => {
    mountOutlinerMenu(document);
    document.getElementById('menu-changelog').click();
    assert.deepEqual(opened, [OUTLINER_CHANGELOG_URL]);
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

  it('opens the Privacy policy page', () => {
    mountOutlinerMenu(document);
    document.getElementById('menu-privacy').click();
    assert.deepEqual(opened, [OUTLINER_PRIVACY_URL]);
  });

  it('places Outliner left of File in index.html with Privacy after Report issues', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const outlinerAt = html.indexOf('data-menu="outliner"');
    const fileAt = html.indexOf('data-menu="file"');
    assert.ok(outlinerAt >= 0);
    assert.ok(fileAt > outlinerAt);

    const panel = html.slice(outlinerAt, fileAt);
    assert.match(panel, /id="menu-about"[^>]*>\s*About…\s*</);
    assert.match(panel, /id="menu-version"[^>]*>\s*Version…\s*</);
    assert.match(panel, /id="menu-changelog"[^>]*>\s*Change log\s*</);
    assert.match(panel, /id="menu-open-source"[^>]*>\s*Source code\s*</);
    assert.match(panel, /id="menu-report-issues"[^>]*>\s*Report issues\s*</);
    assert.match(panel, /id="menu-privacy"[^>]*>\s*Privacy\s*</);
    assert.ok(panel.indexOf('menu-version') < panel.indexOf('menu-changelog'));
    assert.ok(panel.indexOf('menu-report-issues') < panel.indexOf('menu-privacy'));
    assert.doesNotMatch(html, /chrome-privacy/);
    assert.match(html, /id="outliner-message-dialog"/);
    assert.match(html, /id="outliner-message-title"/);
    assert.match(html, /id="outliner-message-body"/);
    assert.match(html, /id="outliner-message-ok"/);
  });

  it('wires mountOutlinerMenu from app.js', () => {
    const appJs = readFileSync(join(root, 'app.js'), 'utf8');
    assert.match(appJs, /mountOutlinerMenu/);
    assert.match(appJs, /from ['"]\.\/outliner-menu\.js['"]/);
  });
});
