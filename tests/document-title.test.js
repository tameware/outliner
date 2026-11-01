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
  shouldSaveUnderNewName,
  syncDocumentTitleDisplay,
  mountDocumentTitleEditor,
  flushDocumentTitleEditor,
  formatDocumentUpdatedLabel,
  syncDocumentUpdatedDisplay,
} from '../src/chrome/document-title.js';

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

  it('shouldSaveUnderNewName is true when a bound file’s title was renamed', () => {
    assert.equal(
      shouldSaveUnderNewName({
        currentTitle: 'New name',
        boundTitle: 'Old name',
        hasBinding: true,
      }),
      true,
    );
    assert.equal(
      shouldSaveUnderNewName({
        currentTitle: 'Same name',
        boundTitle: 'Same name',
        hasBinding: true,
      }),
      false,
    );
    assert.equal(
      shouldSaveUnderNewName({
        currentTitle: 'New name',
        boundTitle: 'Old name',
        hasBinding: false,
      }),
      false,
    );
    assert.equal(
      shouldSaveUnderNewName({
        currentTitle: 'New name',
        boundTitle: 'Old name',
        hasBinding: true,
        forceNew: true,
      }),
      true,
    );
    assert.equal(
      shouldSaveUnderNewName({
        currentTitle: 'New name',
        boundTitle: 'Old name',
        hasBinding: true,
        allowSaveAsNew: false,
      }),
      false,
    );
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

  it('places #document-title in sticky chrome below the menubar with Updated and owner', () => {
    const html = readFileSync(join(repoRoot, 'index.html'), 'utf8');
    const { document } = new JSDOM(html).window;
    const sticky = document.querySelector('.chrome-sticky');
    const heading = sticky?.querySelector('.document-heading');
    assert.ok(heading);
    const title = heading.querySelector('#document-title');
    const updated = heading.querySelector('#document-updated');
    const owner = heading.querySelector('#cloud-user');
    assert.ok(title);
    assert.ok(updated);
    assert.ok(owner);
    const menubar = sticky.querySelector('.menubar');
    assert.equal(menubar.compareDocumentPosition(heading) & 4, 4);
    assert.equal(title.compareDocumentPosition(updated) & 4, 4);
    assert.equal(updated.compareDocumentPosition(owner) & 4, 4);
    assert.match(title.outerHTML, /contenteditable/);
  });

  it('wires mountDocumentTitleEditor from app.js via document-session', () => {
    const appJs = readFileSync(join(repoRoot, 'src/app.js'), 'utf8');
    assert.match(appJs, /createDocumentSession/);
    assert.match(appJs, /from ['"]\.\/chrome\/document-session\.js['"]/);
    assert.match(appJs, /mountDocumentTitleEditor/);
    assert.match(appJs, /flushDocumentTitleEditor/);
    assert.match(appJs, /flushTitle:\s*\(\)\s*=>\s*flushDocumentTitleEditor/);
    assert.match(appJs, /from ['"]\.\/chrome\/document-title\.js['"]/);
    assert.match(appJs, /onChange:\s*\(title\)\s*=>\s*\{[^}]*applyDocumentTitle/);
    const sessionJs = readFileSync(
      join(repoRoot, 'src/chrome/document-session.js'),
      'utf8',
    );
    assert.match(sessionJs, /syncDocumentTitleDisplay/);
    assert.match(sessionJs, /syncDocumentUpdatedDisplay/);
    assert.match(sessionJs, /syncTabTitle:\s*true/);
  });
});

describe('document title editor', () => {
  /** @type {HTMLElement} */
  let el;
  /** @type {string[]} */
  let commits;
  /** @type {() => void} */
  let unbind;

  beforeEach(() => {
    const dom = new JSDOM(
      `<!DOCTYPE html><html><head><title>Bridge notes</title></head>
       <body><p id="document-title" class="document-title" contenteditable="true">Bridge notes •</p></body>`,
      { url: 'http://localhost/', pretendToBeVisual: true },
    );
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    el = document.getElementById('document-title');
    commits = [];
    unbind = mountDocumentTitleEditor(el, {
      onCommit: (title) => {
        commits.push(title);
      },
      isReadOnly: () => false,
    });
  });

  it('stays non-editable until mousedown so load/refresh focus cannot steal outline shortcuts', () => {
    assert.equal(el.getAttribute('contenteditable'), 'false');
    el.focus();
    assert.equal(el.getAttribute('contenteditable'), 'false');
    el.dispatchEvent(
      new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );
    el.focus();
    assert.notEqual(el.getAttribute('contenteditable'), 'false');
  });

  it('strips the dirty bullet while editing and commits the trimmed name on blur', () => {
    beginEdit();
    assert.equal(el.textContent, 'Bridge notes');
    el.textContent = '  Renamed outline  ';
    el.blur();
    assert.deepEqual(commits, ['Renamed outline']);
  });

  function beginEdit() {
    el.dispatchEvent(
      new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );
    el.focus();
  }

  it('commits Untitled when the edited name is cleared', () => {
    beginEdit();
    el.textContent = '   ';
    el.blur();
    assert.deepEqual(commits, [UNTITLED_DOCUMENT_TITLE]);
  });

  it('Escape restores the pre-edit name without committing', () => {
    beginEdit();
    el.textContent = 'Scratch';
    el.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(el.textContent, 'Bridge notes');
    assert.deepEqual(commits, []);
  });

  it('Enter commits and blurs', () => {
    beginEdit();
    el.textContent = 'Deal sheet';
    el.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.deepEqual(commits, ['Deal sheet']);
  });

  it('flushDocumentTitleEditor commits the in-progress name without blurring', () => {
    beginEdit();
    el.textContent = 'Saved name';
    flushDocumentTitleEditor(el);
    assert.deepEqual(commits, ['Saved name']);
    assert.equal(document.activeElement, el);
  });

  it('ignores Enter and Escape while an IME composition is active', () => {
    beginEdit();
    el.textContent = '候補';
    el.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
        isComposing: true,
      }),
    );
    assert.deepEqual(commits, []);
    assert.equal(document.activeElement, el);

    el.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
        isComposing: true,
      }),
    );
    assert.equal(el.textContent, '候補');
    assert.deepEqual(commits, []);
  });

  it('does not overwrite the field while it is being edited', () => {
    beginEdit();
    el.textContent = 'Typing';
    syncDocumentTitleDisplay(el, 'Other', { dirty: true });
    assert.equal(el.textContent, 'Typing');
  });

  it('syncTabTitle while editing mirrors the in-progress name onto document.title', () => {
    beginEdit();
    el.textContent = 'Bridge notes';
    syncDocumentTitleDisplay(el, 'Untitled', { dirty: true, syncTabTitle: true });
    assert.equal(el.textContent, 'Bridge notes');
    assert.equal(document.title, 'Bridge notes •');
  });

  it('notifies onChange while typing so the tab title can track the rename', () => {
    unbind();
    const changes = [];
    unbind = mountDocumentTitleEditor(el, {
      onCommit: (title) => commits.push(title),
      onChange: (title) => changes.push(title),
      isReadOnly: () => false,
    });
    beginEdit();
    el.textContent = 'Live name';
    el.dispatchEvent(new window.InputEvent('input', { bubbles: true }));
    assert.deepEqual(changes, ['Live name']);
    assert.deepEqual(commits, []);
  });

  it('disables editing while read-only', () => {
    unbind();
    commits = [];
    mountDocumentTitleEditor(el, {
      onCommit: (title) => commits.push(title),
      isReadOnly: () => true,
    });
    assert.equal(el.getAttribute('contenteditable'), 'false');
    el.focus();
    el.textContent = 'Nope';
    el.blur();
    assert.deepEqual(commits, []);
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
