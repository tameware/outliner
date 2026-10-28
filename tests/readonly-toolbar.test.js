import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { applyReadOnlyToolbar } from '../readonly-toolbar.js';

describe('read-only toolbar', () => {
  it('keeps File, Edit, and View visible and enables Export plus Expand/Collapse', () => {
    const dom = new JSDOM(`<!DOCTYPE html><body>
      <nav class="menubar">
        <div class="menu" data-menu="file" hidden>
          <button type="button" class="menu-label">File</button>
          <div class="menu-panel">
            <button type="button" role="menuitem" id="menu-open">Open…</button>
            <button type="button" role="menuitem" id="menu-export">Export…</button>
          </div>
        </div>
        <div class="menu" data-menu="edit" hidden>
          <button type="button" class="menu-label">Edit</button>
          <div class="menu-panel">
            <button type="button" role="menuitem" id="menu-undo">Undo</button>
            <button type="button" role="menuitem" id="menu-clear">Clear Outline</button>
          </div>
        </div>
        <div class="menu" data-menu="view">
          <button type="button" class="menu-label">View</button>
          <div class="menu-panel">
            <button type="button" role="menuitem" id="menu-expand-all">Expand All</button>
            <button type="button" role="menuitem" id="menu-collapse-all">Collapse All</button>
          </div>
        </div>
      </nav>
    </body>`);
    const toolbar = dom.window.document.querySelector('.menubar');
    applyReadOnlyToolbar(toolbar);

    const visibleMenus = [...toolbar.querySelectorAll('.menu')]
      .filter((menu) => !menu.hidden)
      .map((menu) => menu.getAttribute('data-menu'));
    assert.deepEqual(visibleMenus, ['file', 'edit', 'view']);

    const enabled = [...toolbar.querySelectorAll('[role="menuitem"]')]
      .filter((btn) => !btn.disabled)
      .map((btn) => btn.id);
    assert.deepEqual(enabled, [
      'menu-export',
      'menu-expand-all',
      'menu-collapse-all',
    ]);
  });
});
