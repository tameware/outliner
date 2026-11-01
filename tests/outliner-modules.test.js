/**
 * Locks the outliner.js split: focused modules + a stable barrel re-export.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('outliner module split', () => {
  it('keeps model, opml, keys, and mount as separate source files', async () => {
    for (const rel of [
      'src/outliner/model.js',
      'src/outliner/opml.js',
      'src/outliner/keys.js',
      'src/outliner/mount.js',
    ]) {
      await access(join(root, rel));
    }
  });

  it('exports structure APIs from model.js', async () => {
    const mod = await import('../src/outliner/model.js');
    for (const name of [
      'createItem',
      'addItemAfter',
      'addItemBelow',
      'removeItem',
      'demoteItem',
      'promoteItem',
      'promoteChildren',
      'demoteFollowingSiblings',
      'moveItemUp',
      'moveItemDown',
      'toggleItem',
      'applyOpenExpansion',
      'focusItem',
      'serializeOutline',
      'isReadOnly',
      'setReadOnly',
      'syncTree',
      'childList',
    ]) {
      assert.equal(typeof mod[name], 'function', name);
    }
  });

  it('exports OPML APIs from opml.js', async () => {
    const mod = await import('../src/outliner/opml.js');
    for (const name of [
      'toOpml',
      'parseOpml',
      'loadOutline',
      'insertOutline',
      'clearOutline',
      'downloadOpml',
      'readOpmlFile',
    ]) {
      assert.equal(typeof mod[name], 'function', name);
    }
  });

  it('exports key handling from keys.js', async () => {
    const mod = await import('../src/outliner/keys.js');
    assert.equal(typeof mod.createKeydownHandler, 'function');
  });

  it('exports mountOutliner and boot from mount.js', async () => {
    const mod = await import('../src/outliner/mount.js');
    assert.equal(typeof mod.mountOutliner, 'function');
    assert.equal(typeof mod.boot, 'function');
  });

  it('re-exports the public API from outliner.js for existing imports', async () => {
    const barrel = await import('../src/outliner/outliner.js');
    for (const name of [
      'mountOutliner',
      'boot',
      'toOpml',
      'parseOpml',
      'loadOutline',
      'createItem',
      'promoteItem',
      'focusItem',
      'setReadOnly',
    ]) {
      assert.equal(typeof barrel[name], 'function', name);
    }
    assert.equal(barrel.createKeydownHandler, undefined);
    assert.equal(barrel.childList, undefined);
  });
});
