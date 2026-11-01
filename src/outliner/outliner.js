/**
 * WYSIWYG HTML outliner based on nested ordered lists.
 *
 * Public barrel — implementation lives in model / opml / keys / mount.
 */

export {
  getItemText,
  getItemTexts,
  hasChildren,
  isExpanded,
  itemOutlineDepth,
  applyOpenExpansion,
  toggleItem,
  expandItemFully,
  collapseItemFully,
  createItem,
  addItemAfter,
  addItemBelow,
  removeItem,
  mergeWithPreviousLine,
  demoteItem,
  promoteItem,
  promoteChildren,
  moveItemUp,
  moveItemDown,
  demoteFollowingSiblings,
  serializeOutline,
  focusItem,
  focusSameLevelSibling,
  focusAdjacentItem,
  isReadOnly,
  setReadOnly,
} from './model.js';

export {
  toOpml,
  parseOpml,
  loadOutline,
  insertOutline,
  clearOutline,
  downloadOpml,
  readOpmlFile,
} from './opml.js';

export { mountOutliner, boot } from './mount.js';
