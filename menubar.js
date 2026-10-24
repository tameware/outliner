/**
 * File / Edit / View menubar helpers.
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
 * Exclusive open + close menus after a menuitem is chosen.
 * @param {ParentNode | null | undefined} menubar
 */
export function mountMenubar(menubar) {
  if (!menubar) return () => {};

  const menus = [...menubar.querySelectorAll('details.menu')];

  function onToggle(event) {
    const opened = event.target;
    if (!opened || opened.tagName !== 'DETAILS' || !opened.open) return;
    for (const menu of menus) {
      if (menu !== opened) menu.open = false;
    }
  }

  function onItemClick(event) {
    const item = event.target?.closest?.('[role="menuitem"]');
    if (!item || !menubar.contains(item)) return;
    const menu = item.closest('details.menu');
    if (menu) menu.open = false;
  }

  function onDocumentPointerDown(event) {
    if (menubar.contains(event.target)) return;
    for (const menu of menus) menu.open = false;
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape') return;
    for (const menu of menus) menu.open = false;
  }

  for (const menu of menus) {
    menu.addEventListener('toggle', onToggle);
  }
  menubar.addEventListener('click', onItemClick);
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', onKeyDown);

  return () => {
    for (const menu of menus) {
      menu.removeEventListener('toggle', onToggle);
    }
    menubar.removeEventListener('click', onItemClick);
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    document.removeEventListener('keydown', onKeyDown);
  };
}
