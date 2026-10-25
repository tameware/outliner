/**
 * Edit → Indent / Outdent: same structural ops as Tab / Shift+Tab.
 */
import { demoteItem, promoteItem } from './outliner.js';

/**
 * @param {{
 *   indentButton?: Element | null,
 *   outdentButton?: Element | null,
 *   getActiveItem: () => HTMLElement | null | undefined,
 *   runStructural: (mutate: () => boolean | void) => boolean | void,
 *   isReadOnly?: () => boolean,
 * }} options
 */
export function mountIndentOutdentMenu({
  indentButton,
  outdentButton,
  getActiveItem,
  runStructural,
  isReadOnly,
}) {
  /** @param {'indent' | 'outdent'} action */
  function run(action) {
    if (isReadOnly?.()) return false;
    const item = getActiveItem();
    if (!item) return false;
    return runStructural(() =>
      action === 'indent' ? demoteItem(item) : promoteItem(item),
    );
  }

  indentButton?.addEventListener('click', () => {
    run('indent');
  });
  outdentButton?.addEventListener('click', () => {
    run('outdent');
  });

  return { run };
}
