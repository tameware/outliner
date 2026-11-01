/**
 * Edit/View menu wiring: undo/redo, indent/move/find, focus, expand, clear, revert.
 */

import {
  promoteChildren,
  demoteFollowingSiblings,
  moveItemUp,
  moveItemDown,
  toggleItem,
  focusItem,
} from '../outliner/outliner.js';
import { handlePromoteDemoteShortcut } from '../outliner/promote-demote-keys.js';
import {
  handleMoveUpDownShortcut,
  isForeignMoveShortcutTarget,
} from '../outliner/move-up-down-keys.js';
import { mountIndentOutdentMenu } from '../outliner/indent-outdent-menu.js';
import { mountMoveUpDownMenu } from '../outliner/move-up-down-menu.js';
import { mountFindReplace } from '../outliner/find-replace-ui.js';
import {
  focusOutlineItem,
  unfocusOutline,
  isOutlineFocusActive,
} from '../outliner/outline-focus.js';
import {
  revertToCleanSnapshot,
  syncRevertMenuItem,
} from '../outliner/revert-outline.js';
import { systemBeep as defaultBeep } from './system-beep.js';

/**
 * @param {{
 *   root: HTMLElement,
 *   api: { getActiveItem?: () => HTMLElement | null | undefined },
 *   outlineHistory: {
 *     run: (mutate: () => boolean | void) => boolean | void,
 *     undo: () => void,
 *     redo: () => void,
 *     clear: () => void,
 *   },
 *   dirty: { isDirty: () => boolean, getBaseline: () => string },
 *   applyDocumentTitle: (title: string) => void,
 *   applyDocumentUpdated: (date: Date | string | number | null) => void,
 *   syncDocumentTitles: () => void,
 *   parseOpml: Function,
 *   loadOutline: Function,
 *   clearLocalFileHandle: () => void,
 *   restoreOutlineFocus: () => void,
 *   syncCloudSaveState?: () => void,
 *   beep?: () => void,
 *   document?: Document,
 *   window?: Window,
 * }} deps
 */
export function bindOutlineChrome(deps) {
  const {
    root,
    api,
    outlineHistory,
    dirty,
    applyDocumentTitle,
    applyDocumentUpdated,
    syncDocumentTitles,
    parseOpml,
    loadOutline,
    clearLocalFileHandle,
    restoreOutlineFocus,
    syncCloudSaveState,
    beep = defaultBeep,
  } = deps;
  const doc = deps.document ?? document;
  const win = deps.window ?? window;

  // Keep outline focus when using the menubar / cloud chrome (including menu labels).
  doc
    .querySelectorAll(
      '.menubar .menu-label, .menubar [role="menuitem"], .cloud-bar button',
    )
    .forEach((btn) => {
      btn.addEventListener('mousedown', (event) => event.preventDefault());
    });

  /** @param {'promote' | 'demote'} action */
  function runPromoteDemote(action) {
    const item = api.getActiveItem?.();
    if (!item) return false;
    return outlineHistory.run(() =>
      action === 'promote' ? promoteChildren(item) : demoteFollowingSiblings(item),
    );
  }

  /** @param {'up' | 'down'} action */
  function runMoveUpDown(action) {
    const item = api.getActiveItem?.();
    if (!item) return false;
    return outlineHistory.run(() =>
      action === 'up' ? moveItemUp(item) : moveItemDown(item),
    );
  }

  const isReadOnly = () => root.dataset.readonly === 'true';

  doc.getElementById('menu-undo')?.addEventListener('click', () => {
    if (isReadOnly()) return;
    outlineHistory.undo();
  });
  doc.getElementById('menu-redo')?.addEventListener('click', () => {
    if (isReadOnly()) return;
    outlineHistory.redo();
  });

  mountIndentOutdentMenu({
    indentButton: doc.getElementById('menu-indent'),
    outdentButton: doc.getElementById('menu-outdent'),
    getActiveItem: () => api.getActiveItem?.(),
    runStructural: (mutate) => outlineHistory.run(mutate),
    isReadOnly,
  });

  mountMoveUpDownMenu({
    upButton: doc.getElementById('menu-move-up'),
    downButton: doc.getElementById('menu-move-down'),
    getActiveItem: () => api.getActiveItem?.(),
    runStructural: (mutate) => outlineHistory.run(mutate),
    isReadOnly,
    beep,
  });

  mountFindReplace({
    dialog: doc.getElementById('find-replace-dialog'),
    findButton: doc.getElementById('menu-find'),
    replaceButton: doc.getElementById('menu-replace'),
    getRoot: () => root,
    getActiveItem: () => api.getActiveItem?.(),
    runStructural: (mutate) => outlineHistory.run(mutate),
    isReadOnly,
    beep,
  });

  doc.getElementById('menu-promote')?.addEventListener('click', () => {
    if (isReadOnly()) return;
    if (!runPromoteDemote('promote')) beep();
  });
  doc.getElementById('menu-demote')?.addEventListener('click', () => {
    if (isReadOnly()) return;
    if (!runPromoteDemote('demote')) beep();
  });

  doc.addEventListener(
    'keydown',
    (event) => {
      handlePromoteDemoteShortcut(event, {
        run: runPromoteDemote,
        beep,
        isReadOnly,
      });
      handleMoveUpDownShortcut(event, {
        run: runMoveUpDown,
        beep,
        isReadOnly,
      });
    },
    true,
  );

  const focusButton = doc.getElementById('menu-focus');
  const unfocusButton = doc.getElementById('menu-unfocus');

  function syncFocusMenus() {
    if (unfocusButton) unfocusButton.disabled = !isOutlineFocusActive(root);
  }

  focusButton?.addEventListener('click', () => {
    const item = api.getActiveItem?.();
    if (!item) {
      beep();
      return;
    }
    if (!focusOutlineItem(root, item)) {
      beep();
      return;
    }
    if (item.dataset.hasChildren === 'true' && item.dataset.state === 'collapsed') {
      toggleItem(item);
    }
    syncFocusMenus();
  });

  unfocusButton?.addEventListener('click', () => {
    if (!unfocusOutline(root)) {
      beep();
      return;
    }
    syncFocusMenus();
  });

  syncFocusMenus();

  doc.getElementById('menu-expand-all')?.addEventListener('click', () => {
    root
      .querySelectorAll('[data-item][data-has-children="true"]')
      .forEach((item) => {
        if (item.dataset.state === 'collapsed') toggleItem(item);
      });
  });
  doc.getElementById('menu-collapse-all')?.addEventListener('click', () => {
    root
      .querySelectorAll('[data-item][data-has-children="true"]')
      .forEach((item) => {
        if (item.dataset.state !== 'collapsed') toggleItem(item);
      });
  });

  doc.getElementById('menu-clear')?.addEventListener('click', () => {
    if (isReadOnly()) return;
    outlineHistory.clear();
    clearLocalFileHandle();
    syncFocusMenus();
    const first = root.querySelector('[data-item]');
    if (first) focusItem(first);
  });

  const revertButtons = [
    doc.getElementById('menu-revert'),
    doc.getElementById('menu-cloud-revert'),
  ].filter(Boolean);

  function syncRevert() {
    const dirtyNow = () => dirty.isDirty();
    for (const btn of revertButtons) {
      if (isReadOnly()) {
        btn.disabled = true;
        continue;
      }
      syncRevertMenuItem(btn, dirtyNow);
    }
    syncDocumentTitles();
    syncCloudSaveState?.();
  }

  syncRevert();
  doc
    .querySelector('[data-menu="file"] .menu-label')
    ?.addEventListener('click', syncRevert);
  doc
    .querySelector('[data-menu="cloud"] .menu-label')
    ?.addEventListener('click', syncRevert);
  root.addEventListener('input', () => {
    applyDocumentUpdated(new Date());
    syncRevert();
  });

  function onRevert() {
    if (isReadOnly()) return;
    const ok = revertToCleanSnapshot({
      isDirty: () => dirty.isDirty(),
      getBaseline: () => dirty.getBaseline(),
      getRoot: () => root,
      parseOpml,
      loadOutline,
      setTitle: (title) => {
        applyDocumentTitle(title);
      },
      run: (mutate) => outlineHistory.run(mutate),
    });
    if (ok) {
      syncFocusMenus();
      const first = root.querySelector('[data-item]');
      if (first) focusItem(first);
    }
    syncRevert();
  }

  doc.getElementById('menu-revert')?.addEventListener('click', onRevert);
  doc.getElementById('menu-cloud-revert')?.addEventListener('click', onRevert);

  function reclaimOutlineFocusIfIdle() {
    const active = doc.activeElement;
    if (active && root.contains(active)) return;
    if (active?.closest?.('dialog[open]')) return;
    if (isForeignMoveShortcutTarget(active)) return;
    restoreOutlineFocus();
  }
  reclaimOutlineFocusIfIdle();
  // Refresh / bfcache restore often leaves focus on chrome or a leftover dialog
  // control; reclaim so ⌘← / ⌘→ hit the outline. (Avoid window `focus` — that
  // steals clicks on the document title when returning to the tab.)
  win.requestAnimationFrame(reclaimOutlineFocusIfIdle);
  win.addEventListener('pageshow', reclaimOutlineFocusIfIdle);

  return {
    syncFocusMenus,
    syncRevert,
    reclaimOutlineFocusIfIdle,
  };
}
