import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  cloudSaveMenuLabel,
  mountMenubar,
  syncCloudSaveMenuLabel,
} from '../menubar.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function setupDom() {
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <nav class="menubar" role="menubar">
      <div class="menu" data-menu="file">
        <button type="button" class="menu-label" aria-haspopup="menu" aria-expanded="false">File</button>
        <div class="menu-panel" role="menu" hidden>
          <button type="button" role="menuitem" id="menu-open">Open…</button>
          <button type="button" role="menuitem" id="menu-save">Save…</button>
        </div>
      </div>
      <div class="menu" data-menu="edit">
        <button type="button" class="menu-label" aria-haspopup="menu" aria-expanded="false">Edit</button>
        <div class="menu-panel" role="menu" hidden>
          <button type="button" role="menuitem" id="menu-undo">Undo</button>
        </div>
      </div>
      <div class="menu" data-menu="view">
        <button type="button" class="menu-label" aria-haspopup="menu" aria-expanded="false">View</button>
        <div class="menu-panel" role="menu" hidden>
          <button type="button" role="menuitem" id="menu-expand-all">Expand All</button>
        </div>
      </div>
    </nav>
  </body>`);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  return dom;
}

describe('menubar', () => {
  beforeEach(() => {
    setupDom();
  });

  it('labels Save… only when Save will open a name dialog (no outline id yet)', () => {
    assert.equal(cloudSaveMenuLabel(null), 'Save…');
    assert.equal(cloudSaveMenuLabel(''), 'Save…');
    assert.equal(cloudSaveMenuLabel('abc'), 'Save');
  });

  it('updates the Save menu item label from the outline id', () => {
    const btn = document.getElementById('menu-save');
    syncCloudSaveMenuLabel(btn, null);
    assert.equal(btn.textContent, 'Save…');
    syncCloudSaveMenuLabel(btn, 'id-1');
    assert.equal(btn.textContent, 'Save');
  });

  it('opens one dropdown at a time without hiding other menu labels', () => {
    const menubar = document.querySelector('.menubar');
    mountMenubar(menubar);
    const file = document.querySelector('[data-menu="file"]');
    const edit = document.querySelector('[data-menu="edit"]');
    const view = document.querySelector('[data-menu="view"]');
    const fileLabel = file.querySelector('.menu-label');
    const editLabel = edit.querySelector('.menu-label');

    fileLabel.click();
    assert.equal(file.classList.contains('is-open'), true);
    assert.equal(edit.classList.contains('is-open'), false);
    assert.equal(view.classList.contains('is-open'), false);
    assert.equal(fileLabel.getAttribute('aria-expanded'), 'true');
    assert.equal(edit.hidden, false);
    assert.equal(view.hidden, false);
    assert.equal(editLabel.hidden, false);

    editLabel.click();
    assert.equal(file.classList.contains('is-open'), false);
    assert.equal(edit.classList.contains('is-open'), true);
    assert.equal(file.hidden, false);
    assert.equal(view.hidden, false);

    document.getElementById('menu-undo').click();
    assert.equal(edit.classList.contains('is-open'), false);
  });

  it('uses plain menu labels, not bordered button chrome classes on the bar', () => {
    const html = document.querySelector('.menubar').outerHTML;
    assert.match(html, /class="menu-label"/);
    assert.doesNotMatch(html, /<summary>/);
    assert.doesNotMatch(html, /<details/);
  });
});

describe('sticky chrome menubar', () => {
  it('keeps brand + menus in .chrome-sticky above the document title in index.html', () => {
    const html = readFileSync(join(repoRoot, 'index.html'), 'utf8');
    const { document } = new JSDOM(html).window;
    const sticky = document.querySelector('.chrome-sticky');
    assert.ok(sticky, 'expected .chrome-sticky wrapper');
    assert.ok(sticky.querySelector('.chrome-meta'));
    assert.ok(sticky.querySelector('.menubar'));
    assert.equal(sticky.querySelector('.document-heading'), null);
    const heading = document.querySelector('.document-heading');
    assert.ok(heading);
    assert.equal(sticky.compareDocumentPosition(heading) & 4, 4);
  });

  it('pins .chrome-sticky with an opaque bar so menus stay visible while the outline scrolls', () => {
    const css = readFileSync(join(repoRoot, 'styles.css'), 'utf8');
    assert.match(
      css,
      /\.chrome-sticky\s*\{[^}]*position\s*:\s*sticky/s,
    );
    assert.match(css, /\.chrome-sticky\s*\{[^}]*top\s*:\s*0/s);
    assert.match(css, /\.chrome-sticky\s*\{[^}]*z-index\s*:\s*\d+/s);
    assert.match(
      css,
      /\.chrome-sticky\s*\{[^}]*background[^;]*;/s,
    );
    assert.match(
      css,
      /\.chrome-sticky\s*\{[^}]*border-bottom\s*:/s,
    );
  });

  it('places .chrome-sticky as a direct body child so sticky survives past the header', () => {
    const html = readFileSync(join(repoRoot, 'index.html'), 'utf8');
    const { document } = new JSDOM(html).window;
    const sticky = document.querySelector('.chrome-sticky');
    assert.equal(sticky.parentElement, document.body);
    assert.ok(document.querySelector('header.chrome .document-heading'));
  });
});
