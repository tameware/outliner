import {
  outlineIdFromLocation,
  viewTokenFromLocation,
  editTokenFromLocation,
} from './cloud.js';
import { showOutlineLoading } from './outline-loading.js';

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
 * Replace baked-in starter content before an async id load finishes.
 * @param {HTMLElement} root
 * @param {{ search?: string, hash?: string }} locationLike
 * @param {{ loadOutline: typeof import('./outliner.js').loadOutline }} options
 * @returns {boolean} true when the outline was blanked for loading
 */
export function blankOutlineForDeepLink(root, locationLike, { loadOutline }) {
  if (!root || !hasRemoteOutlineParams(locationLike)) return false;
  showOutlineLoading(root, { loadOutline });
  return true;
}
