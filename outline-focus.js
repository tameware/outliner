/**
 * OmniOutliner-style Focus / Unfocus: zoom the view to a topic and its
 * descendants, with a stack so Unfocus steps back out.
 */

/** @type {WeakMap<ParentNode, HTMLElement[]>} */
const focusStacks = new WeakMap();

/**
 * @param {ParentNode | null | undefined} root
 * @returns {HTMLElement[]}
 */
function stackFor(root) {
  if (!root) return [];
  let stack = focusStacks.get(root);
  if (!stack) {
    stack = [];
    focusStacks.set(root, stack);
  }
  return stack;
}

/**
 * @param {ParentNode} root
 * @param {HTMLElement[]} stack
 */
function applyFocusRoles(root, stack) {
  const focusRoot = stack[stack.length - 1] ?? null;
  if (typeof root.setAttribute === 'function') {
    if (focusRoot) root.setAttribute('data-focused', '');
    else root.removeAttribute('data-focused');
  }

  root.querySelectorAll('[data-item]').forEach((item) => {
    if (!item?.dataset) return;
    if (!focusRoot || !root.contains(focusRoot)) {
      delete item.dataset.focusRole;
      return;
    }
    if (item === focusRoot || focusRoot.contains(item)) {
      item.dataset.focusRole = 'visible';
    } else if (item.contains(focusRoot)) {
      item.dataset.focusRole = 'ancestor';
    } else {
      item.dataset.focusRole = 'hidden';
    }
  });
}

/**
 * @param {ParentNode | null | undefined} root
 * @returns {boolean}
 */
export function isOutlineFocusActive(root) {
  return Boolean(root && stackFor(root).length);
}

/**
 * Zoom the outline to `item` (and its descendants). Nested Focus drills in;
 * focusing outside the current zoom replaces the stack.
 * @param {ParentNode | null | undefined} root
 * @param {HTMLElement | null | undefined} item
 * @returns {boolean}
 */
export function focusOutlineItem(root, item) {
  if (!root || !item || !root.contains(item)) return false;
  const stack = stackFor(root);
  const current = stack[stack.length - 1];
  if (current === item) return false;
  if (current && !current.contains(item)) {
    stack.length = 0;
  }
  stack.push(item);
  applyFocusRoles(root, stack);
  return true;
}

/**
 * Step out one Focus level (or clear when at the outer focus).
 * @param {ParentNode | null | undefined} root
 * @returns {boolean}
 */
export function unfocusOutline(root) {
  if (!root) return false;
  const stack = stackFor(root);
  if (!stack.length) return false;
  stack.pop();
  applyFocusRoles(root, stack);
  return true;
}

/**
 * Clear all Focus levels.
 * @param {ParentNode | null | undefined} root
 */
export function clearOutlineFocus(root) {
  if (!root) return;
  const stack = stackFor(root);
  stack.length = 0;
  applyFocusRoles(root, stack);
}
