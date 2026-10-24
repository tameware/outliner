import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { applyReadOnlyToolbar } from '../readonly-toolbar.js';

describe('read-only toolbar', () => {
  it('keeps only the View menu with Expand/Collapse in read-only mode', () => {
    const dom = new JSDOM(`<!DOCTYPE html><body>
      <nav class="menubar toolbar">
        <details class="menu" data-menu="file">
          <summary>File</summary>
          <div class="menu-panel">
            <button type="button" role="menuitem" id="menu-open">Open…</button>
            <button type="button" role="menuitem" id="menu-export">Export…</button>
          </div>
        </details>
        <details class="menu" data-menu="edit">
          <summary>Edit</summary>
          <div class="menu-panel">
            <button type="button" role="menuitem" id="menu-undo">Undo</button>
            <button type="button" role="menuitem" id="menu-clear">Clear Outline</button>
          </div>
        </details>
        <details class="menu" data-menu="view">
          <summary>View</summary>
          <div class="menu-panel">
            <button type="button" role="menuitem" id="menu-expand-all">Expand All</button>
            <button type="button" role="menuitem" id="menu-collapse-all">Collapse All</button>
          </div>
        </details>
      </nav>
    </body>`);
    const toolbar = dom.window.document.querySelector('.menubar');
    applyReadOnlyToolbar(toolbar);

    const visibleMenus = [...toolbar.querySelectorAll('details.menu')]
      .filter((menu) => !menu.hidden)
      .map((menu) => menu.getAttribute('data-menu'));
    assert.deepEqual(visibleMenus, ['view']);

    const visibleItems = [...toolbar.querySelectorAll('[role="menuitem"]')]
      .filter((btn) => !btn.hidden)
      .map((btn) => btn.id);
    assert.deepEqual(visibleItems, ['menu-expand-all', 'menu-collapse-all']);
  });
});
