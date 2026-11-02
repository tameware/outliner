/**
 * Escape and Cmd/Ctrl+. dismiss open dialogs (Mac cancel convention).
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  closeDialog,
  openDialogEl,
  isDialogOpen,
  bindDialogDismissKeys,
} from '../src/cloud/cloud-ui-dom.js';

describe('dialog dismiss keys', () => {
  /** @type {Window & typeof globalThis} */
  let window;
  /** @type {Document} */
  let document;
  /** @type {HTMLDialogElement} */
  let dialog;

  beforeEach(() => {
    const dom = new JSDOM(
      `<!DOCTYPE html><body>
        <dialog id="sample-dialog">
          <input id="sample-input" />
          <button type="button" id="sample-cancel">Cancel</button>
        </dialog>
      </body>`,
      { url: 'http://localhost/', pretendToBeVisual: true },
    );
    window = dom.window;
    document = window.document;
    globalThis.window = window;
    globalThis.document = document;
    globalThis.KeyboardEvent = window.KeyboardEvent;

    dialog = document.getElementById('sample-dialog');
    dialog.show = () => dialog.setAttribute('open', '');
    dialog.showModal = () => dialog.setAttribute('open', '');
    dialog.close = () => dialog.removeAttribute('open');
  });

  afterEach(() => {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.KeyboardEvent;
  });

  it('reports open state from the open attribute', () => {
    assert.equal(isDialogOpen(dialog), false);
    openDialogEl(dialog);
    assert.equal(isDialogOpen(dialog), true);
    closeDialog(dialog);
    assert.equal(isDialogOpen(dialog), false);
  });

  it('closes an open dialog on Escape', () => {
    openDialogEl(dialog);
    bindDialogDismissKeys(dialog);
    const input = document.getElementById('sample-input');
    input.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(isDialogOpen(dialog), false);
  });

  it('closes an open dialog on Cmd/Ctrl+.', () => {
    openDialogEl(dialog);
    bindDialogDismissKeys(dialog);
    const input = document.getElementById('sample-input');
    input.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: '.',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(isDialogOpen(dialog), false);

    openDialogEl(dialog);
    input.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: '.',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(isDialogOpen(dialog), false);
  });

  it('invokes onDismiss instead of the default close when provided', () => {
    openDialogEl(dialog);
    let dismissed = 0;
    bindDialogDismissKeys(dialog, {
      onDismiss: () => {
        dismissed += 1;
        closeDialog(dialog);
      },
    });
    dialog.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(dismissed, 1);
    assert.equal(isDialogOpen(dialog), false);
  });

  it('ignores dismiss keys while the dialog is closed', () => {
    let dismissed = 0;
    bindDialogDismissKeys(dialog, {
      onDismiss: () => {
        dismissed += 1;
      },
    });
    dialog.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(dismissed, 0);
  });
});
