import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchPromoteDemoteShortcut } from '../promote-demote-keys.js';

describe('promote/demote shortcuts', () => {
  it('maps Cmd/Ctrl+[ to promote and Cmd/Ctrl+] to demote', () => {
    assert.equal(
      matchPromoteDemoteShortcut({ key: '[', metaKey: true }),
      'promote',
    );
    assert.equal(
      matchPromoteDemoteShortcut({ key: ']', metaKey: true }),
      'demote',
    );
    assert.equal(
      matchPromoteDemoteShortcut({ key: '[', ctrlKey: true }),
      'promote',
    );
    assert.equal(
      matchPromoteDemoteShortcut({ key: ']', ctrlKey: true }),
      'demote',
    );
  });

  it('ignores shortcuts without a modifier or with Shift/Alt', () => {
    assert.equal(matchPromoteDemoteShortcut({ key: ']' }), null);
    assert.equal(
      matchPromoteDemoteShortcut({ key: ']', metaKey: true, shiftKey: true }),
      null,
    );
    assert.equal(
      matchPromoteDemoteShortcut({ key: ']', metaKey: true, altKey: true }),
      null,
    );
    assert.equal(
      matchPromoteDemoteShortcut({ key: 'z', metaKey: true }),
      null,
    );
  });
});
