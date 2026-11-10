/**
 * Mount and boot the outliner on a DOM root.
 */

import { fillTextWithSuits } from './suit-shortcuts.js';
import { bindOutlineLinks } from './outline-links.js';
import { bindOutlinePlainPaste } from './outline-paste.js';
import {
  childList,
  syncTree,
  addItemAfter,
  addItemBelow,
  removeItem,
  promoteItem,
  demoteItem,
  promoteChildren,
  demoteFollowingSiblings,
  moveItemUp,
  moveItemDown,
  toggleItem,
  expandItemFully,
  collapseItemFully,
  focusSameLevelSibling,
  focusAdjacentItem,
  serializeOutline,
} from './model.js';
import { createKeydownHandler, handleClick, itemFromEventTarget } from './keys.js';

export function mountOutliner(root, options = {}) {
  if (!root) throw new Error('outline root required');
  let lastFocusedItem = root.querySelector('[data-item]');

  root.querySelectorAll('[data-item]').forEach((item) => {
    if (!item.dataset.state) item.dataset.state = 'expanded';
    const list = childList(item);
    if (list) list.hidden = item.dataset.state === 'collapsed';
  });
  syncTree(root);

  function rememberItem(event) {
    const item = itemFromEventTarget(event.target);
    if (item && root.contains(item)) lastFocusedItem = item;
  }

  function getActiveItem() {
    const el = document.activeElement;
    const fromFocus = el?.closest?.('[data-item]');
    if (fromFocus && root.contains(fromFocus)) return fromFocus;
    if (lastFocusedItem && root.contains(lastFocusedItem)) return lastFocusedItem;
    return root.querySelector('[data-item]');
  }

  if (options.bindEvents !== false) {
    // Document capture: handle Option+arrows before the editing host.
    const onKeyDown = createKeydownHandler(
      { ...options, getActiveItem },
      root,
    );
    document.addEventListener('keydown', onKeyDown, true);
    root.addEventListener('click', (event) => {
      rememberItem(event);
      handleClick(event);
    });
    root.addEventListener('focusin', rememberItem);
    root.addEventListener('mouseup', rememberItem);
    bindOutlinePlainPaste(root);
    bindOutlineLinks(root, { fillLine: fillTextWithSuits });
  }

  return {
    root,
    addItemAfter,
    addItemBelow,
    removeItem,
    promoteItem,
    demoteItem,
    promoteChildren,
    demoteFollowingSiblings,
    moveItemUp,
    moveItemDown,
    toggleItem,
    expandItemFully,
    collapseItemFully,
    focusSameLevelSibling,
    focusAdjacentItem,
    getActiveItem,
    serialize: () => serializeOutline(root),
  };
}

// Browser entry: auto-mount when loaded as a classic or module script with a root present.
export function boot(selector = '[data-outline-root]', options = {}) {
  const root = document.querySelector(selector);
  if (!root) return null;
  return mountOutliner(root, options);
}
