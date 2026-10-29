/**
 * Prompt before replacing the current outline when it has unsaved changes.
 */

/**
 * Ask the browser to confirm leaving when the outline is dirty.
 * Custom Save UI is not allowed on unload; this only triggers the generic leave prompt.
 *
 * @param {EventTarget | null | undefined} target typically `window`
 * @param {() => boolean} isDirty
 * @returns {() => void} unbind
 */
export function bindBeforeUnloadGuard(target, isDirty) {
  if (!target?.addEventListener) return () => {};

  function onBeforeUnload(event) {
    if (!isDirty()) return;
    event.preventDefault();
    // Chromium still requires a non-empty returnValue to show the prompt.
    event.returnValue = '';
    return '';
  }

  target.addEventListener('beforeunload', onBeforeUnload);
  return () => target.removeEventListener('beforeunload', onBeforeUnload);
}

/**
 * @param {object} options
 * @param {() => boolean} options.isDirty
 * @param {() => Promise<boolean>} options.save resolves true if saved
 * @param {() => Promise<'save' | 'discard' | 'cancel'>} options.ask
 * @returns {Promise<'proceed' | 'cancel'>}
 */
export async function offerSaveIfDirty({ isDirty, save, ask }) {
  if (!isDirty()) return 'proceed';
  const choice = await ask();
  if (choice === 'cancel') return 'cancel';
  if (choice === 'discard') return 'proceed';
  const saved = await save();
  return saved ? 'proceed' : 'cancel';
}

/**
 * Wire a Save / Don't Save / Cancel dialog into an ask() Promise.
 * @param {HTMLDialogElement | HTMLElement | null | undefined} dialog
 * @returns {() => Promise<'save' | 'discard' | 'cancel'>}
 */
export function mountUnsavedChangesDialog(dialog) {
  if (!dialog) {
    return async () => 'cancel';
  }

  const btnSave = dialog.querySelector('#unsaved-save');
  const btnDiscard = dialog.querySelector('#unsaved-discard');
  const btnCancel = dialog.querySelector('#unsaved-cancel');

  /** @type {((value: 'save' | 'discard' | 'cancel') => void) | null} */
  let settle = null;

  function finish(value) {
    if (dialog.close) dialog.close();
    else dialog.removeAttribute('open');
    const resolve = settle;
    settle = null;
    resolve?.(value);
  }

  btnSave?.addEventListener('click', () => finish('save'));
  btnDiscard?.addEventListener('click', () => finish('discard'));
  btnCancel?.addEventListener('click', () => finish('cancel'));
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    finish('cancel');
  });
  // Classic Mac OS 9 alert keys: Return = Save, Esc/Cmd-. = Cancel, Cmd-D = Don't Save.
  dialog.addEventListener('keydown', (event) => {
    if (!settle) return;
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === 'Enter' && !event.shiftKey && !mod && !event.altKey) {
      event.preventDefault();
      finish('save');
      return;
    }
    if (event.key === 'Escape' || (mod && event.key === '.')) {
      event.preventDefault();
      finish('cancel');
      return;
    }
    if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      finish('discard');
    }
  });

  return function ask() {
    return new Promise((resolve) => {
      settle = resolve;
      if (dialog.showModal) dialog.showModal();
      else dialog.setAttribute('open', '');
      btnSave?.focus?.();
    });
  };
}
