import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { applyReadOnlyToolbar } from '../readonly-toolbar.js';

describe('read-only toolbar', () => {
  it('keeps Outliner, File, Edit, and View visible and enables info plus Export/Expand/Collapse', () => {
    const dom = new JSDOM(`<!DOCTYPE html><body>
      <nav class="menubar">
        <div class="menu" data-menu="outliner" hidden>
          <button type="button" class="menu-label">Outliner</button>
          <div class="menu-panel">
            <button type="button" role="menuitem" id="menu-about">About</button>
            <button type="button" role="menuitem" id="menu-version">Version</button>
            <button type="button" role="menuitem" id="menu-changelog">Change Log</button>
            <button type="button" role="menuitem" id="menu-open-source">Open-Source Repository</button>
            <button type="button" role="menuitem" id="menu-report-issues">Report issues</button>
            <button type="button" role="menuitem" id="menu-privacy">Privacy</button>
          </div>
        </div>
        <div class="menu" data-menu="file" hidden>
          <button type="button" class="menu-label">File</button>
          <div class="menu-panel">
            <button type="button" role="menuitem" id="menu-file-save">Save…</button>
          </div>
        </div>
        <div class="menu" data-menu="edit" hidden>
          <button type="button" class="menu-label">Edit</button>
          <div class="menu-panel">
            <button type="button" role="menuitem" id="menu-undo">Undo</button>
            <button type="button" role="menuitem" id="menu-find">Find…</button>
            <button type="button" role="menuitem" id="menu-replace">Replace…</button>
            <button type="button" role="menuitem" id="menu-clear">Clear Outline</button>
          </div>
        </div>
        <div class="menu" data-menu="view">
          <button type="button" class="menu-label">View</button>
          <div class="menu-panel">
            <button type="button" role="menuitem" id="menu-focus">Focus</button>
            <button type="button" role="menuitem" id="menu-unfocus">Unfocus</button>
            <button type="button" role="menuitem" id="menu-expand-all">Expand All</button>
            <button type="button" role="menuitem" id="menu-collapse-all">Collapse All</button>
          </div>
        </div>
        <div class="menu" data-menu="cloud">
          <button type="button" class="menu-label">Cloud</button>
          <div class="menu-panel">
            <button type="button" role="menuitem" id="menu-cloud-auth">Sign in with Google</button>
            <button type="button" role="menuitem" id="menu-cloud-share">Copy read-only link</button>
          </div>
        </div>
      </nav>
    </body>`);
    const toolbar = dom.window.document.querySelector('.menubar');
    applyReadOnlyToolbar(toolbar);

    const visibleMenus = [...toolbar.querySelectorAll('.menu')]
      .filter((menu) => !menu.hidden)
      .map((menu) => menu.getAttribute('data-menu'));
    assert.deepEqual(visibleMenus, ['outliner', 'file', 'edit', 'view']);
    assert.equal(toolbar.querySelector('[data-menu="cloud"]').hidden, true);

    const enabled = [...toolbar.querySelectorAll('[role="menuitem"]')]
      .filter((btn) => !btn.disabled)
      .map((btn) => btn.id);
    assert.deepEqual(enabled, [
      'menu-about',
      'menu-version',
      'menu-changelog',
      'menu-open-source',
      'menu-report-issues',
      'menu-privacy',
      'menu-file-save',
      'menu-find',
      'menu-focus',
      'menu-unfocus',
      'menu-expand-all',
      'menu-collapse-all',
    ]);
    assert.equal(toolbar.querySelector('#menu-replace').disabled, true);
  });
});
