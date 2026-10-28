/** Product / help menu for the Outliner app chrome. */

export const OUTLINER_VERSION = '1.0.0';

export const OUTLINER_REPO_URL = 'https://github.com/tameware/outliner';

export const OUTLINER_ISSUES_MAILTO = 'mailto:outliner@tameware.com';

export const OUTLINER_ABOUT_TEXT =
  'Tameware Outliner is a WYSIWYG HTML outliner with expand/collapse editing, OPML import/export, and optional Google Drive sync.';

/**
 * @param {ParentNode | null | undefined} root
 * @param {{
 *   alert?: (message: string) => void,
 *   open?: (url: string) => unknown,
 * }} [deps]
 */
export function mountOutlinerMenu(root, deps = {}) {
  if (!root) return;
  const alertFn = deps.alert || ((msg) => window.alert(msg));
  const openFn =
    deps.open || ((url) => window.open(url, '_blank', 'noopener,noreferrer'));

  const about = root.querySelector('#menu-about');
  const version = root.querySelector('#menu-version');
  const openSource = root.querySelector('#menu-open-source');
  const report = root.querySelector('#menu-report-issues');

  about?.addEventListener('click', () => alertFn(OUTLINER_ABOUT_TEXT));
  version?.addEventListener('click', () => alertFn(OUTLINER_VERSION));
  openSource?.addEventListener('click', () => openFn(OUTLINER_REPO_URL));
  report?.addEventListener('click', () => openFn(OUTLINER_ISSUES_MAILTO));
}
