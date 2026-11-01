import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createDocumentSession } from '../src/chrome/document-session.js';
import {
  APP_DOCUMENT_TITLE,
  DIRTY_TITLE_SUFFIX,
} from '../src/chrome/document-title.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('document session', () => {
  /** @type {ReturnType<typeof createDocumentSession>} */
  let session;
  /** @type {HTMLElement} */
  let titleEl;
  /** @type {HTMLElement} */
  let updatedEl;
  let dirty = false;
  let loading = false;

  beforeEach(() => {
    const dom = new JSDOM(
      `<!DOCTYPE html><html><head><title>${APP_DOCUMENT_TITLE}</title></head>
       <body>
         <p id="document-title"></p>
         <time id="document-updated" hidden></time>
       </body>`,
      { url: 'http://localhost/' },
    );
    globalThis.document = dom.window.document;
    titleEl = document.getElementById('document-title');
    updatedEl = document.getElementById('document-updated');
    dirty = false;
    loading = false;
    session = createDocumentSession({
      titleEl,
      updatedEl,
      isDirty: () => dirty,
      isLoading: () => loading,
    });
  });

  it('maps the product title to Untitled and remembers a bound name', () => {
    assert.equal(session.outlineTitleBase(), 'Untitled');
    session.rememberBoundTitle();
    assert.equal(session.getBoundTitle(), 'Untitled');
    session.applyDocumentTitle('Bridge notes');
    session.rememberBoundTitle();
    assert.equal(session.getBoundTitle(), 'Bridge notes');
    assert.equal(session.outlineTitleBase(), 'Bridge notes');
  });

  it('syncs chrome and tab titles, including the dirty bullet', () => {
    session.applyDocumentTitle('Deal sheet');
    assert.equal(titleEl.textContent, 'Deal sheet');
    assert.equal(document.title, 'Deal sheet');

    dirty = true;
    session.syncDocumentTitles();
    assert.equal(titleEl.textContent, `Deal sheet${DIRTY_TITLE_SUFFIX}`);
    assert.equal(document.title, `Deal sheet${DIRTY_TITLE_SUFFIX}`);
  });

  it('clears the chrome title while the outline is loading', () => {
    session.applyDocumentTitle('Notes');
    loading = true;
    session.syncDocumentTitles();
    assert.equal(titleEl.textContent, '');
    assert.equal(document.title, 'Notes');
  });

  it('writes Updated timestamps into the time element', () => {
    const when = new Date('2026-10-29T15:04:00Z');
    session.applyDocumentUpdated(when);
    assert.equal(updatedEl.hidden, false);
    assert.match(updatedEl.textContent, /^Updated /);
    assert.equal(session.getUpdatedAt()?.toISOString(), when.toISOString());
  });

  it('is wired from app.js', () => {
    const appJs = readFileSync(join(repoRoot, 'src/app.js'), 'utf8');
    assert.match(appJs, /createDocumentSession/);
    assert.match(appJs, /from ['"]\.\/chrome\/document-session\.js['"]/);
  });
});
