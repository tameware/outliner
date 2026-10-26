import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  offerSaveIfDirty,
  mountUnsavedChangesDialog,
} from '../unsaved-changes.js';

describe('unsaved changes offer', () => {
  it('proceeds immediately when clean', async () => {
    const saves = [];
    const asks = [];
    const result = await offerSaveIfDirty({
      isDirty: () => false,
      save: async () => {
        saves.push(1);
        return true;
      },
      ask: async () => {
        asks.push(1);
        return 'save';
      },
    });
    assert.equal(result, 'proceed');
    assert.equal(saves.length, 0);
    assert.equal(asks.length, 0);
  });

  it('saves then proceeds when the user chooses Save', async () => {
    const saves = [];
    const result = await offerSaveIfDirty({
      isDirty: () => true,
      save: async () => {
        saves.push(1);
        return true;
      },
      ask: async () => 'save',
    });
    assert.equal(result, 'proceed');
    assert.equal(saves.length, 1);
  });

  it('cancels when Save is chosen but save fails or is aborted', async () => {
    const result = await offerSaveIfDirty({
      isDirty: () => true,
      save: async () => false,
      ask: async () => 'save',
    });
    assert.equal(result, 'cancel');
  });

  it('proceeds without saving on discard and cancels on cancel', async () => {
    assert.equal(
      await offerSaveIfDirty({
        isDirty: () => true,
        save: async () => true,
        ask: async () => 'discard',
      }),
      'proceed',
    );
    assert.equal(
      await offerSaveIfDirty({
        isDirty: () => true,
        save: async () => true,
        ask: async () => 'cancel',
      }),
      'cancel',
    );
  });
});

describe('unsaved changes dialog', () => {
  beforeEach(() => {
    const dom = new JSDOM(`<!DOCTYPE html><body>
      <dialog id="unsaved-dialog">
        <p>Save changes?</p>
        <div class="cloud-dialog-actions">
          <button type="button" id="unsaved-discard">Don't Save</button>
          <button type="button" id="unsaved-cancel">Cancel</button>
          <button type="submit" id="unsaved-save" autofocus>Save</button>
        </div>
      </dialog>
    </body>`, { url: 'http://localhost/' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const el = document.getElementById('unsaved-dialog');
    el.showModal = () => el.setAttribute('open', '');
    el.close = () => el.removeAttribute('open');
  });

  it('lays out Dont Save, Cancel, Save left-to-right with Save as default', () => {
    const buttons = [...document.querySelectorAll('#unsaved-dialog button')].map(
      (b) => b.id,
    );
    assert.deepEqual(buttons, ['unsaved-discard', 'unsaved-cancel', 'unsaved-save']);
    const save = document.getElementById('unsaved-save');
    assert.equal(save.getAttribute('type'), 'submit');
    assert.ok(save.hasAttribute('autofocus'));
  });

  it('resolves save, discard, or cancel from the dialog buttons', async () => {
    const ask = mountUnsavedChangesDialog(document.getElementById('unsaved-dialog'));
    const pending = ask();
    assert.ok(document.getElementById('unsaved-dialog').hasAttribute('open'));
    document.getElementById('unsaved-discard').click();
    assert.equal(await pending, 'discard');

    const pendingSave = ask();
    document.getElementById('unsaved-save').click();
    assert.equal(await pendingSave, 'save');

    const pendingCancel = ask();
    document.getElementById('unsaved-cancel').click();
    assert.equal(await pendingCancel, 'cancel');
  });

  it('Return saves, Escape/Cmd-. cancel, and Cmd/Ctrl+D discards', async () => {
    const dialog = document.getElementById('unsaved-dialog');
    const ask = mountUnsavedChangesDialog(dialog);

    const pendingSave = ask();
    dialog.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(await pendingSave, 'save');

    const pendingEsc = ask();
    dialog.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(await pendingEsc, 'cancel');

    const pendingCmdDot = ask();
    dialog.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: '.',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(await pendingCmdDot, 'cancel');

    const pendingDiscard = ask();
    dialog.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'd',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(await pendingDiscard, 'discard');

    const pendingCtrlDiscard = ask();
    dialog.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'd',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(await pendingCtrlDiscard, 'discard');
  });
});
