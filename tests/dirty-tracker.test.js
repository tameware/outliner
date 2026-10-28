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

  it('getBaseline returns the last clean snapshot', () => {
    let snap = 'clean-opml';
    const dirty = createDirtyTracker({ getSnapshot: () => snap });
    assert.equal(dirty.getBaseline(), 'clean-opml');
    snap = 'dirty-opml';
    assert.equal(dirty.getBaseline(), 'clean-opml');
    dirty.markClean();
    assert.equal(dirty.getBaseline(), 'dirty-opml');
  });

  it('compares content snapshots while revert baseline can include expansion', () => {
    let content = 'body-a';
    let full = 'full-a-expanded';
    const dirty = createDirtyTracker({
      getContentSnapshot: () => content,
      getRevertSnapshot: () => full,
    });
    assert.equal(dirty.isDirty(), false);
    assert.equal(dirty.getBaseline(), 'full-a-expanded');
    full = 'full-a-collapsed';
    assert.equal(dirty.isDirty(), false);
    content = 'body-b';
    full = 'full-b';
    assert.equal(dirty.isDirty(), true);
    dirty.markClean();
    assert.equal(dirty.isDirty(), false);
    assert.equal(dirty.getBaseline(), 'full-b');
  });
});
