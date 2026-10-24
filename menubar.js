/**
 * File / Edit / View menubar helpers (classic dropdown menus).
 */

/** @param {string | null | undefined} outlineId */
export function cloudSaveMenuLabel(outlineId) {
  return outlineId && String(outlineId).trim() ? 'Save' : 'Save…';
}

/**
 * @param {HTMLElement | null | undefined} button
 * @param {string | null | undefined} outlineId
 */
export function syncCloudSaveMenuLabel(button, outlineId) {
  if (!button) return;
  button.textContent = cloudSaveMenuLabel(outlineId);
}

/**
 * @param {Element} menu
 * @param {boolean} open
 */
function setMenuOpen(menu, open) {
  menu.classList.toggle('is-open', open);
  const panel = menu.querySelector('.menu-panel');
  const label = menu.querySelector('.menu-label');
  if (panel) panel.hidden = !open;
  if (label) label.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/**
 * Exclusive open + close menus after a menuitem is chosen.
 * @param {ParentNode | null | undefined} menubar
 */
export function mountMenubar(menubar) {
  if (!menubar) return () => {};

  const menus = [...menubar.querySelectorAll('.menu')];

  function closeAll() {
    for (const menu of menus) setMenuOpen(menu, false);
  }

  function onMenubarClick(event) {
    const label = event.target?.closest?.('.menu-label');
    if (label && menubar.contains(label)) {
      event.preventDefault();
      const menu = label.closest('.menu');
      const willOpen = !menu.classList.contains('is-open');
      closeAll();
      if (willOpen) setMenuOpen(menu, true);
      return;
    }

    const item = event.target?.closest?.('[role="menuitem"]');
    if (item && menubar.contains(item)) {
      closeAll();
    }
  }

  function onDocumentPointerDown(event) {
    if (menubar.contains(event.target)) return;
    closeAll();
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape') return;
    closeAll();
  }

  menubar.addEventListener('click', onMenubarClick);
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', onKeyDown);

  return () => {
    menubar.removeEventListener('click', onMenubarClick);
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    document.removeEventListener('keydown', onKeyDown);
  };
}
