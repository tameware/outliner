/** Shown while a remote or local outline is being opened. */
export const OUTLINE_LOADING_MESSAGE = 'Loading your outline…';

/**
 * @param {HTMLElement | null | undefined} root
 * @returns {HTMLElement | null}
 */
function mainFor(root) {
  return root?.closest?.('main') ?? document.querySelector('main');
}

/**
 * @param {HTMLElement | null | undefined} root
 * @returns {HTMLElement | null}
 */
function loadingElFor(root) {
  const main = mainFor(root);
  return (
    main?.querySelector?.('#outline-loading') ||
    document.getElementById('outline-loading')
  );
}

/**
 * @param {HTMLElement | null | undefined} root
 * @returns {boolean}
 */
export function isOutlineLoading(root) {
  return mainFor(root)?.getAttribute('data-loading') === 'true';
}

/**
 * Hide the outline and show a blank loading message (clears starter content).
 * @param {HTMLElement | null | undefined} root
 * @param {{
 *   loadOutline?: typeof import('./outliner.js').loadOutline,
 *   message?: string,
 * }} [options]
 */
export function showOutlineLoading(root, options = {}) {
  if (!root) return;
  const main = mainFor(root);
  const loading = loadingElFor(root);
  if (loading) {
    loading.textContent = options.message || OUTLINE_LOADING_MESSAGE;
    loading.hidden = false;
  }
  if (main) main.setAttribute('data-loading', 'true');
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-outline-loading', 'true');
  }
  // Avoid flashing "Untitled" while a Drive / share / local open is in flight.
  const title = document.getElementById('document-title');
  if (title) title.textContent = '';
  if (typeof options.loadOutline === 'function') {
    options.loadOutline(root, { items: [] });
  }
}

/**
 * @param {HTMLElement | null | undefined} root
 */
export function hideOutlineLoading(root) {
  const main = mainFor(root);
  const loading = loadingElFor(root);
  if (loading) loading.hidden = true;
  if (main) main.removeAttribute('data-loading');
  if (typeof document !== 'undefined') {
    document.documentElement.removeAttribute('data-outline-loading');
  }
}
