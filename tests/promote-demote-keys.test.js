import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchPromoteDemoteShortcut,
  handlePromoteDemoteShortcut,
} from '../promote-demote-keys.js';

describe('promote/demote shortcuts', () => {
  it('maps Cmd/Ctrl/Alt+[ to promote and Cmd/Ctrl/Alt+] to demote', () => {
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
    assert.equal(
      matchPromoteDemoteShortcut({ key: '[', altKey: true }),
      'promote',
    );
    assert.equal(
      matchPromoteDemoteShortcut({ key: ']', altKey: true }),
      'demote',
    );
  });

  it('ignores shortcuts without a modifier or with Shift', () => {
    assert.equal(matchPromoteDemoteShortcut({ key: ']' }), null);
    assert.equal(
      matchPromoteDemoteShortcut({ key: ']', metaKey: true, shiftKey: true }),
      null,
    );
    assert.equal(
      matchPromoteDemoteShortcut({ key: 'z', metaKey: true }),
      null,
    );
  });

  it('ignores Ctrl+Alt (AltGr) bracket keys so layouts can type [ and ]', () => {
    assert.equal(
      matchPromoteDemoteShortcut({ key: '[', ctrlKey: true, altKey: true }),
      null,
    );
    assert.equal(
      matchPromoteDemoteShortcut({ key: ']', ctrlKey: true, altKey: true }),
      null,
    );
  });

  it('always prevents default for Cmd+[ even when promote fails, and beeps', () => {
    const beeps = [];
    const event = {
      key: '[',
      metaKey: true,
      preventDefault() {
        event.prevented = true;
      },
      prevented: false,
    };
    const handled = handlePromoteDemoteShortcut(event, {
      run: () => false,
      beep: () => beeps.push(1),
      isReadOnly: () => false,
    });
    assert.equal(handled, true);
    assert.equal(event.prevented, true);
    assert.equal(beeps.length, 1);
  });

  it('runs promote when possible without beeping', () => {
    const beeps = [];
    const runs = [];
    const event = {
      key: '[',
      metaKey: true,
      preventDefault() {
        event.prevented = true;
      },
      prevented: false,
    };
    handlePromoteDemoteShortcut(event, {
      run: (action) => {
        runs.push(action);
        return true;
      },
      beep: () => beeps.push(1),
      isReadOnly: () => false,
    });
    assert.deepEqual(runs, ['promote']);
    assert.equal(event.prevented, true);
    assert.equal(beeps.length, 0);
  });

  it('blocks browser Back in read-only mode and beeps', () => {
    const beeps = [];
    const runs = [];
    const event = {
      key: '[',
      metaKey: true,
      preventDefault() {
        event.prevented = true;
      },
      prevented: false,
    };
    handlePromoteDemoteShortcut(event, {
      run: (action) => {
        runs.push(action);
        return true;
      },
      beep: () => beeps.push(1),
      isReadOnly: () => true,
    });
    assert.equal(event.prevented, true);
    assert.deepEqual(runs, []);
    assert.equal(beeps.length, 1);
  });
});
