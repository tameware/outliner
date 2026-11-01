import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cloudOpenUpdatedAt,
  deepLinkDocumentTitle,
  shouldIgnoreStaleDeepLink,
  shouldSyncOwnerUrlAfterDeepLink,
} from '../src/cloud/loaded-outline.js';

describe('loaded outline helpers', () => {
  it('cloud open Updated uses OPML dateModified only (never a stale prior stamp)', () => {
    assert.equal(cloudOpenUpdatedAt({ dateModified: '2026-01-01' }), '2026-01-01');
    assert.equal(cloudOpenUpdatedAt({}), null);
    assert.equal(cloudOpenUpdatedAt({ dateModified: null }), null);
  });

  it('deep-link titles prefer the Drive file name over the OPML head title', () => {
    const title = deepLinkDocumentTitle(
      { title: 'Drive Name.opml' },
      { title: 'OPML Head' },
      (file, head) => `file:${file}|head:${head}`,
    );
    assert.equal(title, 'file:Drive Name.opml|head:OPML Head');
  });

  it('ignores a deep-link result after Cloud Open selected another file', () => {
    assert.equal(
      shouldIgnoreStaleDeepLink({
        shareMode: false,
        requestedId: 'a',
        currentOutlineId: 'b',
      }),
      true,
    );
    assert.equal(
      shouldIgnoreStaleDeepLink({
        shareMode: false,
        requestedId: 'a',
        currentOutlineId: 'a',
      }),
      false,
    );
    assert.equal(
      shouldIgnoreStaleDeepLink({
        shareMode: true,
        requestedId: 'a',
        currentOutlineId: 'b',
      }),
      false,
    );
  });

  it('syncs owner ?id= after deep-link when the binding still matches', () => {
    assert.equal(
      shouldSyncOwnerUrlAfterDeepLink({
        shareMode: false,
        fileId: 'a',
        requestedId: 'a',
        currentOutlineId: 'a',
      }),
      true,
    );
    assert.equal(
      shouldSyncOwnerUrlAfterDeepLink({
        shareMode: false,
        fileId: 'a',
        requestedId: 'a',
        currentOutlineId: 'b',
      }),
      false,
    );
    assert.equal(
      shouldSyncOwnerUrlAfterDeepLink({
        shareMode: true,
        fileId: 'a',
        requestedId: 'a',
        currentOutlineId: 'b',
      }),
      true,
    );
    assert.equal(
      shouldSyncOwnerUrlAfterDeepLink({
        shareMode: false,
        fileId: null,
        requestedId: 'a',
        currentOutlineId: 'a',
      }),
      false,
    );
  });
});
