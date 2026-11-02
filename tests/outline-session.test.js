import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createOutlineSession } from '../src/cloud/outline-session.js';
import { createDocumentSession } from '../src/chrome/document-session.js';
import { createDirtyTracker } from '../src/outliner/dirty-tracker.js';
import { mountOutliner, loadOutline, toOpml, parseOpml } from '../src/outliner/outliner.js';

describe('outline session', () => {
  /** @type {HTMLElement} */
  let root;
  /** @type {ReturnType<typeof createDirtyTracker>} */
  let dirty;
  /** @type {ReturnType<typeof createDocumentSession>} */
  let docSession;
  /** @type {string[]} */
  let syncedUrls;
  /** @type {string[]} */
  let loadedTitles;
  /** @type {number} */
  let historyDiscards;
  /** @type {number} */
  let invalidated;
  /** @type {() => ReturnType<typeof createOutlineSession>} */
  let makeSession;

  beforeEach(() => {
    const dom = new JSDOM(
      `<!DOCTYPE html><html><head><title>Untitled</title></head>
       <body>
         <p id="document-title">Untitled</p>
         <time id="document-updated" hidden></time>
         <ol class="outline" data-outline-root>
           <li data-item><div class="row"><div class="text" contenteditable="true">A</div></div></li>
         </ol>
       </body>`,
      { url: 'http://localhost/?id=seed' },
    );
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.DOMParser = dom.window.DOMParser;
    root = document.querySelector('[data-outline-root]');
    mountOutliner(root, { bindEvents: false });
    syncedUrls = [];
    loadedTitles = [];
    historyDiscards = 0;
    invalidated = 0;

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
    docSession.applyDocumentTitle('Seed');
    docSession.rememberBoundTitle();

    makeSession = () =>
      createOutlineSession({
        root,
        initialOutlineId: 'seed',
        dirty,
        docSession,
        toOpml,
        parseOpml,
        // Same shape app.js passes: loadOutline(root, tree).
        loadOutline: (outlineRoot, tree) => {
          loadedTitles.push(tree?.title ?? '');
          loadOutline(outlineRoot, tree);
        },
        applyOpenExpansion: () => {},
        insertOutline: () => true,
        showOutlineLoading: () => {},
        hideOutlineLoading: () => {},
        outlineHistoryDiscard: () => {
          historyDiscards += 1;
        },
        syncFocusMenus: () => {},
        syncHelpEnabled: () => {},
        syncRevert: () => {},
        clearLocalFileHandle: () => {},
        flushTitle: () => {},
        focusFirstItem: () => {},
        getActiveItem: () => root.querySelector('[data-item]'),
        runStructural: (mutate) => mutate(),
        syncUrl: (id) => {
          syncedUrls.push(id);
        },
        onMarkClean: () => {},
        invalidateDeepLink: () => {
          invalidated += 1;
        },
      });
  });

  it('owns Drive binding state and clears it atomically', () => {
    const session = makeSession();
    assert.equal(session.getOutlineId(), 'seed');
    session.facade.setRevision(9);
    session.facade.setLeaseToken('lease');
    session.facade.clearCloudBinding();
    assert.equal(session.getOutlineId(), null);
    assert.equal(session.getRevision(), null);
    assert.equal(session.getLeaseToken(), null);
    assert.deepEqual(syncedUrls, [null]);
  });

  it('commitCloudSave binds id, revision, titles, Updated, and URL', () => {
    const session = makeSession();
    const when = new Date('2026-04-01T12:00:00Z');
    session.facade.commitCloudSave({
      id: 'drive-1',
      revision: 4,
      title: 'Notes',
      updatedAt: when,
    });
    assert.equal(session.getOutlineId(), 'drive-1');
    assert.equal(session.getRevision(), 4);
    assert.equal(session.getLeaseToken(), null);
    assert.equal(session.facade.getTitle(), 'Notes');
    assert.equal(session.facade.getBoundTitle(), 'Notes');
    assert.equal(session.facade.getUpdatedAt()?.toISOString(), when.toISOString());
    assert.deepEqual(syncedUrls, ['drive-1']);
  });

  it('applyCloudOpen loads the tree into the DOM root, binds Drive metadata, and marks clean', () => {
    const session = makeSession();
    const when = new Date('2026-05-01T00:00:00Z');
    session.facade.applyCloudOpen({
      tree: {
        title: 'OPML Head',
        items: [{ text: 'Hello', children: [] }],
        dateModified: new Date('2020-01-01T00:00:00Z'),
      },
      driveId: 'opened-1',
      revision: 2,
      title: 'Drive Name',
      modifiedTime: when,
    });
    assert.deepEqual(loadedTitles, ['OPML Head']);
    // Regression: must call loadOutline(root, tree), not loadOutline(tree).
    assert.equal(root.querySelector('[data-item] .text')?.textContent, 'Hello');
    assert.equal(session.getOutlineId(), 'opened-1');
    assert.equal(session.getRevision(), 2);
    assert.equal(session.facade.getTitle(), 'Drive Name');
    assert.equal(session.facade.getBoundTitle(), 'Drive Name');
    assert.equal(session.facade.getUpdatedAt()?.toISOString(), when.toISOString());
    assert.equal(session.facade.isDirty(), false);
    assert.deepEqual(syncedUrls, ['opened-1']);
  });

  it('beginLoading discards history and invalidates a deep-link fetch', () => {
    const session = makeSession();
    session.facade.beginLoading();
    assert.equal(invalidated, 1);
    assert.equal(historyDiscards, 1);
  });
});
