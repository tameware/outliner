/**
 * Locks the cloud-ui split: focused controllers + a stable mountCloudUi entry.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('cloud-ui module split', () => {
  it('keeps save, picker, share, and dialog helpers as separate source files', async () => {
    for (const rel of [
      'src/cloud/cloud-ui-dom.js',
      'src/cloud/cloud-ui-save.js',
      'src/cloud/cloud-ui-picker.js',
      'src/cloud/cloud-ui-share.js',
      'src/cloud/cloud-ui.js',
    ]) {
      await access(join(root, rel));
    }
  });

  it('exports dialog helpers from cloud-ui-dom.js', async () => {
    const mod = await import('../src/cloud/cloud-ui-dom.js');
    assert.equal(typeof mod.closeDialog, 'function');
    assert.equal(typeof mod.openDialogEl, 'function');
  });

  it('exports createCloudSaveController from cloud-ui-save.js', async () => {
    const mod = await import('../src/cloud/cloud-ui-save.js');
    assert.equal(typeof mod.createCloudSaveController, 'function');
  });

  it('exports picker helpers and createCloudPickerController', async () => {
    const mod = await import('../src/cloud/cloud-ui-picker.js');
    assert.equal(typeof mod.sortedOutlines, 'function');
    assert.equal(typeof mod.fillOutlinePicker, 'function');
    assert.equal(typeof mod.createCloudPickerController, 'function');
  });

  it('exports createCloudShareController from cloud-ui-share.js', async () => {
    const mod = await import('../src/cloud/cloud-ui-share.js');
    assert.equal(typeof mod.createCloudShareController, 'function');
    assert.equal(typeof mod.absoluteShareUrl, 'function');
  });

  it('still exports mountCloudUi from cloud-ui.js', async () => {
    const mod = await import('../src/cloud/cloud-ui.js');
    assert.equal(typeof mod.mountCloudUi, 'function');
  });
});
