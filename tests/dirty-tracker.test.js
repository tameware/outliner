import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDirtyTracker } from '../dirty-tracker.js';

describe('dirty tracker', () => {
  it('starts clean and becomes dirty when the snapshot changes', () => {
    let snap = 'a';
    const dirty = createDirtyTracker({ getSnapshot: () => snap });
    assert.equal(dirty.isDirty(), false);
    snap = 'b';
    assert.equal(dirty.isDirty(), true);
  });

  it('markClean resets the baseline to the current snapshot', () => {
    let snap = 'a';
    const dirty = createDirtyTracker({ getSnapshot: () => snap });
    snap = 'b';
    dirty.markClean();
    assert.equal(dirty.isDirty(), false);
    snap = 'c';
    assert.equal(dirty.isDirty(), true);
  });
});
