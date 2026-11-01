import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createLocalSession } from '../src/file/local-session.js';
import { createDocumentSession } from '../src/chrome/document-session.js';
import { createDirtyTracker } from '../src/outliner/dirty-tracker.js';
import { toOpml, parseOpml, loadOutline, mountOutliner } from '../src/outliner/outliner.js';


describe('local session', () => {
  /** @type {ReturnType<typeof createLocalSession>} */
  let local;
  /** @type {HTMLButtonElement} */
  let saveButton;
  /** @type {HTMLElement} */
  let root;
  /** @type {ReturnType<typeof createDocumentSession>} */
  let docSession;
  /** @type {ReturnType<typeof createDirtyTracker>} */
  let dirty;

  beforeEach(() => {
    const dom = new JSDOM(
      `<!DOCTYPE html><html><head><title>Untitled</title></head>
       <body>
         <p id="document-title">Untitled</p>
         <time id="document-updated" hidden></time>
         <button type="button" id="menu-file-save">Save…</button>
         <input type="file" id="file-open" />
         <ol class="outline" data-outline-root>
           <li data-item><div class="row"><div class="text" contenteditable="true">A</div></div></li>
         </ol>
       </body>`,
      { url: 'http://localhost/', pretendToBeVisual: true },
    );
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    root = document.querySelector('[data-outline-root]');
    mountOutliner(root, { bindEvents: false });
    saveButton = document.getElementById('menu-file-save');
    dirty = createDirtyTracker({
      getContentSnapshot: () => 'snap',
      getRevertSnapshot: () => 'snap',
    });
    docSession = createDocumentSession({
      titleEl: document.getElementById('document-title'),
      updatedEl: document.getElementById('document-updated'),
      isDirty: () => dirty.isDirty(),
      isLoading: () => false,
    });
    docSession.applyDocumentTitle('Notes');
    docSession.rememberBoundTitle();

    local = createLocalSession({
      root,
      documentTitleEl: document.getElementById('document-title'),
      fileInput: document.getElementById('file-open'),
      fileSaveButton: saveButton,
      dirty,
      docSession,
      toOpml,
      parseOpml,
      loadOutline,
      downloadOpml: () => {},
      beforeReplace: async () => true,
      syncRevert: () => {},
      syncFocusMenus: () => {},
      syncHelpEnabled: () => {},
      onReplaceDocument: () => {},
      getActiveItem: () => root.querySelector('[data-item]'),
      runStructural: (mutate) => mutate(),
      insertOutline: () => true,
      outlineHistoryDiscard: () => {},
    });
  });

  it('labels Save with an ellipsis until a local file handle is bound', () => {
    local.syncLocalSaveLabel();
    assert.equal(saveButton.textContent, 'Save…');
    local.setFileHandle({ name: 'notes.opml' });
    assert.equal(saveButton.textContent, 'Save');
    local.clearLocalFileHandle();
    assert.equal(saveButton.textContent, 'Save…');
  });

  it('treats a renamed document as Save As when a handle is already bound', async () => {
    local.setFileHandle({ name: 'notes.opml' });
    docSession.applyDocumentTitle('Renamed');
    let forcePickerSeen = null;
    const result = await local.saveLocalOutline({
      saveOutlineLocally: async (opts) => {
        forcePickerSeen = opts.forcePicker;
        return { ok: true, handle: opts.existingHandle };
      },
      downloadOpml: () => {},
    });
    assert.equal(result, true);
    assert.equal(forcePickerSeen, true);
    assert.equal(docSession.getBoundTitle(), 'Renamed');
  });

  it('replace open notifies onReplaceDocument and applies open expansion', () => {
    let replaced = 0;
    local = createLocalSession({
      root,
      documentTitleEl: document.getElementById('document-title'),
      fileInput: document.getElementById('file-open'),
      fileSaveButton: saveButton,
      dirty,
      docSession,
      toOpml,
      parseOpml,
      loadOutline,
      downloadOpml: () => {},
      beforeReplace: async () => true,
      syncRevert: () => {},
      syncFocusMenus: () => {},
      syncHelpEnabled: () => {},
      onReplaceDocument: () => {
        replaced += 1;
      },
      getActiveItem: () => root.querySelector('[data-item]'),
      runStructural: (mutate) => mutate(),
      insertOutline: () => true,
      outlineHistoryDiscard: () => {},
    });
    local.applyOpenedLocalOutline(
      {
        title: 'Imported',
        items: [
          {
            text: 'Parent A',
            children: [{ text: 'Child A', children: [] }],
          },
          {
            text: 'Parent B',
            children: [{ text: 'Child B', children: [] }],
          },
        ],
      },
      'Imported.opml',
      { updatedAt: new Date('2026-03-01T00:00:00Z') },
    );
    assert.equal(replaced, 1);
    assert.equal(docSession.getUpdatedAt()?.toISOString(), '2026-03-01T00:00:00.000Z');
    // Multiple top-level parents → openDepth 0 → parents stay collapsed.
    const parents = [...root.querySelectorAll(':scope > [data-item]')];
    assert.equal(parents.length, 2);
    assert.ok(parents.every((item) => item.dataset.state === 'collapsed'));
  });
});
