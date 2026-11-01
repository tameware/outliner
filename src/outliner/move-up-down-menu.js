/**
 * Edit → Move Up / Move Down: reorder same-level siblings (subtree moves with the item).
 */
import { moveItemUp, moveItemDown } from './outliner.js';

/**
 * @param {{
 *   upButton?: Element | null,
 *   downButton?: Element | null,
 *   getActiveItem: () => HTMLElement | null | undefined,
 *   runStructural: (mutate: () => boolean | void) => boolean | void,
 *   isReadOnly?: () => boolean,
 *   beep?: () => void,
 * }} options
 */
export function mountMoveUpDownMenu({
  upButton,
  downButton,
  getActiveItem,
  runStructural,
  isReadOnly,
  beep,
}) {
  /** @param {'up' | 'down'} action */
  function run(action) {
    if (isReadOnly?.()) return false;
    const item = getActiveItem();
    if (!item) return false;
    return runStructural(() =>
      action === 'up' ? moveItemUp(item) : moveItemDown(item),
    );
  }

  upButton?.addEventListener('click', () => {
    if (!run('up')) beep?.();
  });
  downButton?.addEventListener('click', () => {
    if (!run('down')) beep?.();
  });

  return { run };
}
