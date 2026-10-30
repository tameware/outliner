import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bindDeepLinkOutlineLoad,
  isSoftDeepLinkLoadError,
} from '../deep-link-load.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('isSoftDeepLinkLoadError', () => {
  it('treats 401 and network Failed to fetch as soft', () => {
    assert.equal(isSoftDeepLinkLoadError({ status: 401, message: 'Nope' }), true);
    assert.equal(isSoftDeepLinkLoadError({ status: 0, message: 'Failed to fetch' }), true);
    assert.equal(isSoftDeepLinkLoadError(new Error('Failed to fetch')), true);
    assert.equal(isSoftDeepLinkLoadError({ status: 403, message: 'forbidden' }), false);
    assert.equal(isSoftDeepLinkLoadError({ status: 502, message: 'bad gateway' }), false);
  });
});

describe('bindDeepLinkOutlineLoad', () => {
  it('loads the outline immediately without waiting for an auth change', async () => {
    const gets = [];
    const applied = [];
    const auth = {
      onAuthStateChanged() {
        // Deliberately never invoke the listener — mirrors “state already known /
        // no change event” and must not block the eager load.
        return () => {};
      },
    };
    const cloud = {
      async getOutline(id) {
        gets.push(id);
        return { opml: '<opml />', revision: 'r1', title: 'Shared' };
      },
    };

    const { ready, destroy } = bindDeepLinkOutlineLoad({
      auth,
      cloud,
      getOutlineId: () => 'file-shared',
      applyOutline: async (got) => {
        applied.push(got);
      },
    });

    await ready;
    assert.deepEqual(gets, ['file-shared']);
    assert.equal(applied.length, 1);
    assert.equal(applied[0].title, 'Shared');
    destroy();
  });

  it('retries after sign-in when the eager load fails', async () => {
    let userCb = null;
    let attempts = 0;
    const auth = {
      onAuthStateChanged(cb) {
        userCb = cb;
        cb(null);
        return () => {};
      },
    };
    const cloud = {
      async getOutline() {
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error('Not signed in'), { status: 401 });
        }
        return { opml: '<opml />', revision: 'r2', title: 'Later' };
      },
    };
    const applied = [];
    const errors = [];

    const { ready, destroy } = bindDeepLinkOutlineLoad({
      auth,
      cloud,
      getOutlineId: () => 'file-1',
      applyOutline: async (got) => {
        applied.push(got.title);
      },
      onError: (err) => errors.push(err),
    });

    await ready;
    assert.equal(applied.length, 0);
    assert.equal(errors.length, 1);

    const authLoad = userCb({ uid: 'u1', displayName: 'Ada' });
    await authLoad;
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(applied, ['Later']);
    destroy();
  });

  it('does nothing when there is no outline id', async () => {
    const cloud = { getOutline: mock.fn(async () => ({ opml: '' })) };
    const { ready, destroy } = bindDeepLinkOutlineLoad({
      auth: { onAuthStateChanged: (cb) => { cb(null); return () => {}; } },
      cloud,
      getOutlineId: () => null,
      applyOutline: async () => {
        assert.fail('should not apply');
      },
    });
    await ready;
    assert.equal(cloud.getOutline.mock.callCount(), 0);
    destroy();
  });

  it('ignores a late deep-link response after invalidate or id change', async () => {
    let resolveGet;
    const applied = [];
    let currentId = 'file-a';
    const cloud = {
      getOutline(id) {
        return new Promise((resolve) => {
          resolveGet = () => resolve({ opml: `<opml>${id}</opml>`, title: id });
        });
      },
    };
    const { ready, destroy, invalidate } = bindDeepLinkOutlineLoad({
      auth: { onAuthStateChanged: () => () => {} },
      cloud,
      getOutlineId: () => currentId,
      applyOutline: async (got) => {
        applied.push(got.title);
      },
    });
    currentId = null;
    invalidate();
    resolveGet();
    await ready;
    assert.deepEqual(applied, []);
    destroy();
  });

  it('app.js syncs the resolved file id through syncUrl after a deep-link load', () => {
    const appJs = readFileSync(join(repoRoot, 'app.js'), 'utf8');
    assert.match(appJs, /bindDeepLinkOutlineLoad\s*\(/);
    assert.match(
      appJs,
      /applyOutline:\s*async\s*\(got\)\s*=>\s*\{[\s\S]*?if\s*\(got\.fileId\)\s*syncUrl\(got\.fileId\)/,
    );
    assert.doesNotMatch(
      appJs,
      /applyOutline:\s*async\s*\(got\)\s*=>\s*\{[\s\S]*?if\s*\(got\.fileId\)\s*currentOutlineId\s*=\s*got\.fileId/,
    );
  });

  it('app.js prefers the Drive file title over the OPML head title on deep-link load', () => {
    const appJs = readFileSync(join(repoRoot, 'app.js'), 'utf8');
    assert.match(appJs, /outlineTitleFromFileName/);
    assert.match(
      appJs,
      /outlineTitleFromFileName\(\s*got\.title\s*,\s*tree\.title\s*\)/,
    );
    assert.doesNotMatch(
      appJs,
      /if \(got\.title \|\| tree\.title\) applyDocumentTitle\(got\.title \|\| tree\.title\)/,
    );
    assert.doesNotMatch(
      appJs,
      /loadOutline:\s*\(tree\)\s*=>\s*\{[^}]*if \(tree\.title\) applyDocumentTitle/,
    );
  });
});
