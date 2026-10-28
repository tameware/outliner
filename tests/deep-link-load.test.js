import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { bindDeepLinkOutlineLoad } from '../deep-link-load.js';

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
});
