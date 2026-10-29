import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  APP_DOCUMENT_TITLE,
  UNTITLED_DOCUMENT_TITLE,
  DIRTY_TITLE_SUFFIX,
  documentTitleLabel,
  stripDirtyTitleSuffix,
  syncDocumentTitleDisplay,
  formatDocumentUpdatedLabel,
  syncDocumentUpdatedDisplay,
} from '../document-title.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('document title display', () => {
  it('maps empty and app titles to Untitled', () => {
    assert.equal(documentTitleLabel(''), UNTITLED_DOCUMENT_TITLE);
    assert.equal(documentTitleLabel('   '), UNTITLED_DOCUMENT_TITLE);
    assert.equal(documentTitleLabel(APP_DOCUMENT_TITLE), UNTITLED_DOCUMENT_TITLE);
    assert.equal(documentTitleLabel('Bridge notes'), 'Bridge notes');
    assert.equal(documentTitleLabel('  Shopping  '), 'Shopping');
  });

  it('appends a dirty bullet after the outline name when dirty', () => {
    assert.equal(DIRTY_TITLE_SUFFIX, ' •');
    assert.equal(documentTitleLabel('Bridge notes', { dirty: true }), 'Bridge notes •');
    assert.equal(documentTitleLabel('', { dirty: true }), 'Untitled •');
    assert.equal(documentTitleLabel('Bridge notes •', { dirty: false }), 'Bridge notes');
    assert.equal(stripDirtyTitleSuffix('Bridge notes •'), 'Bridge notes');
    assert.equal(stripDirtyTitleSuffix('Bridge notes'), 'Bridge notes');
  });

  it('syncDocumentTitleDisplay writes the label into the element', () => {
    const dom = new JSDOM('<p id="document-title"></p>');
    const el = dom.window.document.getElementById('document-title');
    syncDocumentTitleDisplay(el, APP_DOCUMENT_TITLE);
    assert.equal(el.textContent, 'Untitled');
    syncDocumentTitleDisplay(el, 'My outline');
    assert.equal(el.textContent, 'My outline');
    syncDocumentTitleDisplay(el, 'My outline', { dirty: true });
    assert.equal(el.textContent, 'My outline •');
  });

  it('syncDocumentTitleDisplay can mirror the dirty label onto document.title', () => {
    const dom = new JSDOM(
      `<!DOCTYPE html><html><head><title>Bridge notes</title></head>
       <body><p id="document-title"></p></body>`,
    );
    globalThis.document = dom.window.document;
    const el = document.getElementById('document-title');
    syncDocumentTitleDisplay(el, undefined, { dirty: true, syncTabTitle: true });
    assert.equal(el.textContent, 'Bridge notes •');
    assert.equal(document.title, 'Bridge notes •');
    syncDocumentTitleDisplay(el, undefined, { dirty: false, syncTabTitle: true });
    assert.equal(el.textContent, 'Bridge notes');
    assert.equal(document.title, 'Bridge notes');
  });

  it('formatDocumentUpdatedLabel prefixes Updated with a locale timestamp and timezone', () => {
    assert.equal(formatDocumentUpdatedLabel(null), '');
    assert.equal(formatDocumentUpdatedLabel(undefined), '');
    assert.equal(formatDocumentUpdatedLabel('not-a-date'), '');
    const when = new Date('2026-10-29T15:04:00Z');
    const label = formatDocumentUpdatedLabel(when);
    assert.match(label, /^Updated /);
    assert.match(label, /2026/);
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZoneName: 'short',
    }).formatToParts(when);
    const zone = parts.find((p) => p.type === 'timeZoneName')?.value;
    assert.ok(zone, 'expected a short local timezone name');
    assert.match(label, new RegExp(zone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  it('syncDocumentUpdatedDisplay writes Updated text to the right-hand time element', () => {
    const dom = new JSDOM(
      '<div class="document-heading"><p id="document-title">Notes</p><time id="document-updated" hidden></time></div>',
    );
    const el = dom.window.document.getElementById('document-updated');
    syncDocumentUpdatedDisplay(el, null);
    assert.equal(el.hidden, true);
    assert.equal(el.textContent, '');

    const when = new Date('2026-10-29T15:04:00Z');
    syncDocumentUpdatedDisplay(el, when);
    assert.equal(el.hidden, false);
    assert.match(el.textContent, /^Updated /);
    assert.equal(el.getAttribute('datetime'), when.toISOString());
  });

  it('places #document-title below the menubar in index.html with Updated to its right', () => {
    const html = readFileSync(join(repoRoot, 'index.html'), 'utf8');
    const navEnd = html.indexOf('</nav>');
    const titleAt = html.indexOf('id="document-title"');
    const updatedAt = html.indexOf('id="document-updated"');
    assert.ok(navEnd >= 0);
    assert.ok(titleAt > navEnd);
    assert.ok(updatedAt > titleAt);
    assert.match(html, /class="document-heading"/);
    assert.match(html, /id="document-title"/);
    assert.match(html, /id="document-updated"/);
  });

  it('wires syncDocumentTitleDisplay from app.js', () => {
    const appJs = readFileSync(join(repoRoot, 'app.js'), 'utf8');
    assert.match(appJs, /syncDocumentTitleDisplay/);
    assert.match(appJs, /syncDocumentUpdatedDisplay/);
    assert.match(appJs, /from ['"]\.\/document-title\.js['"]/);
    assert.match(appJs, /dirty:\s*dirty\.isDirty\(\)|\{[^}]*dirty:/);
    assert.match(appJs, /syncTabTitle:\s*true/);
  });
});

describe('document title live updates', () => {
  beforeEach(() => {
    const dom = new JSDOM(
      `<!DOCTYPE html><html><head><title>${APP_DOCUMENT_TITLE}</title></head>
       <body><p id="document-title">Untitled</p></body>`,
      { url: 'http://localhost/' },
    );
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
  });

  it('reflects document.title after sync with no explicit title', () => {
    const el = document.getElementById('document-title');
    document.title = 'Deal sheet';
    syncDocumentTitleDisplay(el);
    assert.equal(el.textContent, 'Deal sheet');
  });
});
