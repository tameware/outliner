import {
  outlineIdFromLocation,
  viewTokenFromLocation,
  editTokenFromLocation,
} from '../cloud/cloud.js';
import { showOutlineLoading } from '../outliner/outline-loading.js';

/**
 * @param {{ search?: string, hash?: string }} locationLike
 */
export function hasRemoteOutlineParams(locationLike) {
  return Boolean(
    outlineIdFromLocation(locationLike) ||
      viewTokenFromLocation(locationLike) ||
      editTokenFromLocation(locationLike),
  );
}

/**
 * Clear the outline before an async id/share load finishes (no starter flash).
 * @param {HTMLElement} root
 * @param {{ search?: string, hash?: string }} locationLike
 * @param {{ loadOutline: typeof import('../outliner/outliner.js').loadOutline }} options
 * @returns {boolean} true when the outline was blanked for loading
 */
export function blankOutlineForDeepLink(root, locationLike, { loadOutline }) {
  if (!root || !hasRemoteOutlineParams(locationLike)) return false;
  showOutlineLoading(root, { loadOutline, clear: true });
  return true;
}
