import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  cloudSaveMenuLabel,
  mountMenubar,
  syncCloudSaveMenuLabel,
} from '../menubar.js';

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

  it('labels Save… when unsaved and Save when an outline id exists', () => {
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
