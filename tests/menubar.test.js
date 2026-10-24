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
      <details class="menu" data-menu="file">
        <summary>File</summary>
        <div class="menu-panel" role="menu">
          <button type="button" role="menuitem" id="menu-open">Open…</button>
          <button type="button" role="menuitem" id="menu-save">Save…</button>
          <button type="button" role="menuitem" id="menu-save-as">Save As…</button>
        </div>
      </details>
      <details class="menu" data-menu="edit">
        <summary>Edit</summary>
        <div class="menu-panel" role="menu">
          <button type="button" role="menuitem" id="menu-undo">Undo</button>
        </div>
      </details>
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

  it('keeps only one menu open at a time and closes after choosing an item', () => {
    const menubar = document.querySelector('.menubar');
    mountMenubar(menubar);
    const file = document.querySelector('[data-menu="file"]');
    const edit = document.querySelector('[data-menu="edit"]');
    file.open = true;
    edit.open = true;
    file.dispatchEvent(new window.Event('toggle'));
    assert.equal(file.open, true);
    assert.equal(edit.open, false);

    document.getElementById('menu-open').click();
    assert.equal(file.open, false);
  });
});
