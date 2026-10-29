/**
 * Edit → Find… / Replace… : BBEdit-style shared Find & Replace panel.
 */

import {
  findMatches,
  findNextIndex,
  replaceMatch,
  replaceAllMatches,
  selectTextRange,
} from './find-replace.js';
import { tryInsertSuitShortcutInInput } from './suit-shortcuts.js';

/**
 * @param {{
 *   dialog?: HTMLDialogElement | HTMLElement | null,
 *   findButton?: Element | null,
 *   replaceButton?: Element | null,
 *   getRoot: () => HTMLElement | null | undefined,
 *   getActiveItem?: () => HTMLElement | null | undefined,
 *   runStructural?: (mutate: () => boolean | void) => boolean | void,
 *   isReadOnly?: () => boolean,
 *   beep?: () => void,
 * }} options
 */
export function mountFindReplace({
  dialog,
  findButton,
  replaceButton,
  getRoot,
  getActiveItem,
  runStructural = (mutate) => mutate(),
  isReadOnly,
  beep = () => {},
}) {
  if (!dialog) {
    return { open() {}, destroy() {} };
  }

  const form = dialog.querySelector('#find-replace-form') || dialog.querySelector('form');
  const heading = dialog.querySelector('h2');
  const findInput = dialog.querySelector('#find-replace-find');
  const replaceInput = dialog.querySelector('#find-replace-replace');
  const replaceLabel = dialog.querySelector('label[for="find-replace-replace"]');
  const grepInput = dialog.querySelector('#find-replace-grep');
  const caseInput = dialog.querySelector('#find-replace-case');
  const wrapInput = dialog.querySelector('#find-replace-wrap');
  const statusEl = dialog.querySelector('#find-replace-status');
  const btnPrev = dialog.querySelector('#find-replace-prev');
  const btnNext = dialog.querySelector('#find-replace-next');
  const btnReplace = dialog.querySelector('#find-replace-one');
  const btnReplaceFind = dialog.querySelector('#find-replace-and-find');
  const btnReplaceAll = dialog.querySelector('#find-replace-all');
  const btnClose = dialog.querySelector('#find-replace-close');
  const replaceUi = [replaceLabel, replaceInput, btnReplace, btnReplaceFind, btnReplaceAll];

  /** @type {import('./find-replace.js').FindMatch[]} */
  let matches = [];
  let currentIndex = -1;
  let queryKey = '';

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message || '';
  }

  function queryOptions() {
    return {
      find: findInput?.value ?? '',
      replace: replaceInput?.value ?? '',
      grep: Boolean(grepInput?.checked),
      caseSensitive: Boolean(caseInput?.checked),
      wrapAround: wrapInput ? Boolean(wrapInput.checked) : true,
    };
  }

  function optionsKey(opts) {
    return JSON.stringify({
      find: opts.find,
      grep: opts.grep,
      caseSensitive: opts.caseSensitive,
    });
  }

  function refreshMatches() {
    const root = getRoot();
    const opts = queryOptions();
    queryKey = optionsKey(opts);
    if (!root || !opts.find) {
      matches = [];
      currentIndex = -1;
      return matches;
    }
    matches = findMatches(root, opts);
    if (matches.error) {
      setStatus(`Grep error: ${matches.error}`);
      currentIndex = -1;
      return matches;
    }
    return matches;
  }

  function ensureMatches() {
    const opts = queryOptions();
    if (optionsKey(opts) !== queryKey) refreshMatches();
    return matches;
  }

  /**
   * @param {import('./find-replace.js').FindMatch} match
   * @param {number} index
   * @param {number} total
   */
  function revealMatch(match, index, total) {
    const el = match.item.querySelector(':scope > .row > .text');
    selectTextRange(el, match.start, match.end);
    setStatus(`${index + 1} of ${total}`);
  }

  /**
   * @param {1 | -1} direction
   */
  function step(direction) {
    const opts = queryOptions();
    if (!opts.find) {
      setStatus('Enter text to find');
      findInput?.focus();
      return false;
    }
    const list = ensureMatches();
    if (list.error) return false;
    if (!list.length) {
      setStatus('Not found');
      beep();
      return false;
    }

    let next;
    if (currentIndex < 0) {
      // Start from the active line when possible.
      const active = getActiveItem?.();
      let start = direction === 1 ? -1 : list.length;
      if (active) {
        const idx = list.findIndex((m) => m.item === active || active.contains(m.item));
        if (idx >= 0) start = idx - direction;
      }
      next = findNextIndex(list, start, {
        direction,
        wrapAround: opts.wrapAround,
      });
    } else {
      next = findNextIndex(list, currentIndex, {
        direction,
        wrapAround: opts.wrapAround,
      });
    }

    if (next < 0) {
      setStatus('Not found');
      beep();
      return false;
    }
    currentIndex = next;
    revealMatch(list[currentIndex], currentIndex, list.length);
    return true;
  }

  /**
   * @param {boolean} [focusReplace]
   */
  function openDialog(focusReplace = false) {
    const showReplace = Boolean(focusReplace);
    if (showReplace && isReadOnly?.()) return;
    dialog.setAttribute('data-mode', showReplace ? 'replace' : 'find');
    if (heading) heading.textContent = showReplace ? 'Find & Replace' : 'Find';
    for (const el of replaceUi) {
      if (el) el.hidden = !showReplace;
    }
    if (dialog.show) dialog.show();
    else dialog.setAttribute('open', '');
    const target = showReplace ? replaceInput : findInput;
    target?.focus();
    target?.select?.();
  }

  function closeDialog() {
    if (dialog.close) dialog.close();
    else dialog.removeAttribute('open');
  }

  function runReplaceCurrent() {
    if (isReadOnly?.()) return false;
    const opts = queryOptions();
    if (!opts.find) {
      setStatus('Enter text to find');
      return false;
    }
    const list = ensureMatches();
    if (list.error || !list.length || currentIndex < 0 || currentIndex >= list.length) {
      if (!step(1)) return false;
    }
    const match = matches[currentIndex];
    if (!match) return false;

    const ok = Boolean(
      runStructural(() => {
        const replaced = replaceMatch(match, opts.replace, opts);
        return replaced;
      }),
    );
    if (!ok) return false;

    // Rebuild matches after mutation; stay near the same place.
    const afterOffset = match.start;
    const item = match.item;
    refreshMatches();
    if (!matches.length) {
      setStatus('Replaced (no more matches)');
      currentIndex = -1;
      return true;
    }
    let next = matches.findIndex(
      (m) => m.item === item && m.start >= afterOffset + String(opts.replace ?? '').length,
    );
    if (next < 0) next = matches.findIndex((m) => m.item === item && m.start >= afterOffset);
    if (next < 0) next = 0;
    currentIndex = next;
    setStatus(`Replaced — ${currentIndex + 1} of ${matches.length}`);
    return true;
  }

  function runReplaceAndFind() {
    if (!runReplaceCurrent()) return false;
    if (!matches.length) return true;
    revealMatch(matches[currentIndex], currentIndex, matches.length);
    return true;
  }

  function runReplaceAll() {
    if (isReadOnly?.()) return false;
    const opts = queryOptions();
    if (!opts.find) {
      setStatus('Enter text to find');
      return false;
    }
    const preview = findMatches(getRoot(), opts);
    if (preview.error) {
      setStatus(`Grep error: ${preview.error}`);
      return false;
    }
    if (!preview.length) {
      setStatus('Not found');
      beep();
      return false;
    }
    let count = 0;
    runStructural(() => {
      count = replaceAllMatches(getRoot(), opts);
      return count > 0;
    });
    refreshMatches();
    currentIndex = -1;
    setStatus(count ? `Replaced ${count}` : 'Not found');
    return count > 0;
  }

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    step(1);
  });

  btnPrev?.addEventListener('click', () => {
    step(-1);
  });
  btnNext?.addEventListener('click', () => {
    step(1);
  });
  btnReplace?.addEventListener('click', () => {
    runReplaceCurrent();
  });
  btnReplaceFind?.addEventListener('click', () => {
    runReplaceAndFind();
  });
  btnReplaceAll?.addEventListener('click', () => {
    runReplaceAll();
  });
  btnClose?.addEventListener('click', () => {
    closeDialog();
  });

  for (const el of [findInput, grepInput, caseInput]) {
    el?.addEventListener('input', () => {
      queryKey = '';
      currentIndex = -1;
    });
    el?.addEventListener('change', () => {
      queryKey = '';
      currentIndex = -1;
    });
  }

  replaceInput?.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (!event.key || event.key.length !== 1) return;
    if (tryInsertSuitShortcutInInput(/** @type {HTMLInputElement} */ (replaceInput), event.key)) {
      event.preventDefault();
    }
  });

  findButton?.addEventListener('click', () => {
    openDialog(false);
  });
  replaceButton?.addEventListener('click', () => {
    openDialog(true);
  });

  function onKeyDown(event) {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) return;
    const key = event.key?.toLowerCase?.() || '';
    if (key === 'f' && event.altKey) {
      if (isReadOnly?.()) return;
      event.preventDefault();
      openDialog(true);
      return;
    }
    if (key === 'f' && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      openDialog(false);
    }
  }

  document.addEventListener('keydown', onKeyDown, true);

  return {
    open: openDialog,
    close: closeDialog,
    findNext: () => step(1),
    findPrevious: () => step(-1),
    replace: runReplaceCurrent,
    replaceAndFind: runReplaceAndFind,
    replaceAll: runReplaceAll,
    destroy() {
      document.removeEventListener('keydown', onKeyDown, true);
    },
  };
}
