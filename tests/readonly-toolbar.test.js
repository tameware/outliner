import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { applyReadOnlyToolbar } from '../readonly-toolbar.js';

describe('read-only toolbar', () => {
  it('hides all toolbar buttons except Expand all and Collapse all', () => {
    const dom = new JSDOM(`<!DOCTYPE html><body>
      <div class="toolbar">
        <button type="button" id="btn-remove">Remove</button>
        <button type="button" id="btn-promote">Promote</button>
        <button type="button" id="btn-demote">Demote</button>
        <button type="button" id="btn-expand-all">Expand all</button>
        <button type="button" id="btn-collapse-all">Collapse all</button>
        <button type="button" id="btn-save">Save file</button>
        <button type="button" id="btn-open">Open file</button>
      </div>
    </body>`);
    const toolbar = dom.window.document.querySelector('.toolbar');
    applyReadOnlyToolbar(toolbar);

    const visible = [...toolbar.querySelectorAll('button')]
      .filter((btn) => !btn.hidden)
      .map((btn) => btn.id);
    assert.deepEqual(visible, ['btn-expand-all', 'btn-collapse-all']);
  });
});
