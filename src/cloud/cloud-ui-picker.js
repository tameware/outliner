/**
 * Cloud Open / Insert / Delete outline pickers.
 */

import { outlineTitleFromFileName } from '../file/local-file.js';
import { closeDialog, openDialogEl } from './cloud-ui-dom.js';

/**
 * @param {Array<{ id: string, title?: string }>} outlines
 */
export function sortedOutlines(outlines) {
  return [...outlines].sort((a, b) =>
    String(a.title || a.id).localeCompare(String(b.title || b.id), undefined, {
      sensitivity: 'base',
    }),
  );
}

/**
 * @param {HTMLElement | null} list
 * @param {Array<{ id: string, title?: string }>} outlines
 * @param {(item: { id: string, title?: string }) => void} onPick
 * @param {string} emptyMessage
 */
export function fillOutlinePicker(list, outlines, onPick, emptyMessage) {
  if (!list) return;
  list.replaceChildren();
  const sorted = sortedOutlines(outlines);
  if (!sorted.length) {
    const empty = document.createElement('li');
    empty.textContent = emptyMessage;
    list.appendChild(empty);
    return;
  }
  for (const item of sorted) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.title || item.id;
    btn.addEventListener('click', () => onPick(item));
    li.appendChild(btn);
    list.appendChild(li);
  }
}

/**
 * @param {{
 *   outline: object,
 *   cloud: object,
 *   withBusy: (label: string, fn: () => Promise<void>) => Promise<boolean>,
 *   setStatus: (message: string) => void,
 *   syncSaveLabel: () => void,
 *   rememberDriveFileId: (id: string | null) => void,
 *   getActiveDriveFileId: () => string | null,
 *   openDialog?: HTMLElement | null,
 *   openDialogHeading?: HTMLElement | null,
 *   listEl?: HTMLElement | null,
 *   deleteDialog?: HTMLElement | null,
 *   deleteListEl?: HTMLElement | null,
 * }} deps
 */
export function createCloudPickerController(deps) {
  const {
    outline,
    cloud,
    withBusy,
    setStatus,
    syncSaveLabel,
    rememberDriveFileId,
    getActiveDriveFileId,
    openDialog = null,
    openDialogHeading = null,
    listEl = null,
    deleteDialog = null,
    deleteListEl = null,
  } = deps;

  /** @type {'open' | 'insert'} */
  let outlinePickerMode = 'open';

  async function openOutline(id, listedTitle) {
    if (outline.beforeReplace) {
      const allow = await outline.beforeReplace();
      if (!allow) return;
    }
    outline.beginLoading?.();
    closeDialog(openDialog);
    const ok = await withBusy('Opening…', async () => {
      const got = await cloud.getOutline(id);
      const opml = typeof got === 'string' ? got : got.opml;
      const revision = typeof got === 'string' ? null : got.revision;
      const driveTitle = typeof got === 'string' ? null : got.title;
      const tree = outline.parseOpml(opml);
      const modifiedTime =
        typeof got === 'string' ? null : got.modifiedTime || tree.dateModified;
      const driveId = (typeof got === 'string' ? null : got.fileId) || id;
      const title = outlineTitleFromFileName(listedTitle || driveTitle, tree.title);
      rememberDriveFileId(driveId);
      outline.applyCloudOpen({
        tree,
        driveId,
        revision: revision ?? tree.revision ?? null,
        title,
        modifiedTime: modifiedTime ?? null,
      });
      syncSaveLabel();
      setStatus(title ? `Opened “${title}”` : `Opened ${driveId}`);
    });
    if (!ok) outline.hideLoading?.();
  }

  /**
   * Insert a Drive outline below the caret without replacing the current document.
   * @param {string} id
   * @param {string | undefined} listedTitle
   */
  async function insertOutlineFromCloud(id, listedTitle) {
    if (typeof outline.insertOutline !== 'function') return;
    let title = listedTitle;
    const ok = await withBusy('Inserting…', async () => {
      const got = await cloud.getOutline(id);
      const opml = typeof got === 'string' ? got : got.opml;
      const tree = outline.parseOpml(opml);
      title = listedTitle || tree.title;
      outline.insertOutline(tree);
      closeDialog(openDialog);
    });
    if (ok) setStatus(title ? `Inserted “${title}”` : `Inserted ${id}`);
  }

  async function deleteOutline(id, listedTitle) {
    const label = listedTitle || id;
    const okConfirm = window.confirm(
      `Delete “${label}”? It will move to Google Drive trash.`,
    );
    if (!okConfirm) return;
    const ok = await withBusy('Deleting…', async () => {
      await cloud.deleteOutline(id);
      if (outline.getOutlineId?.() === id || getActiveDriveFileId() === id) {
        rememberDriveFileId(null);
        outline.clearCloudBinding();
        syncSaveLabel();
      }
      closeDialog(deleteDialog);
    });
    if (ok) setStatus(`Deleted “${label}”`);
  }

  /**
   * @param {'open' | 'insert'} mode
   */
  async function showOutlinePicker(mode) {
    outlinePickerMode = mode;
    if (openDialogHeading) {
      openDialogHeading.textContent =
        mode === 'insert' ? 'Insert from Google Drive' : 'Open from Google Drive';
    }
    await withBusy('Loading list…', async () => {
      const outlines = await cloud.listOutlines();
      fillOutlinePicker(
        listEl,
        outlines,
        (item) => {
          if (outlinePickerMode === 'insert') {
            void insertOutlineFromCloud(item.id, item.title);
          } else {
            void openOutline(item.id, item.title);
          }
        },
        'No outlines yet. Save to Google Drive to create one.',
      );
      openDialogEl(openDialog);
    });
  }

  async function onOpen() {
    await showOutlinePicker('open');
  }

  async function onInsert() {
    await showOutlinePicker('insert');
  }

  async function onDeleteMenu() {
    await withBusy('Loading list…', async () => {
      const outlines = await cloud.listOutlines();
      fillOutlinePicker(
        deleteListEl,
        outlines,
        (item) => {
          void deleteOutline(item.id, item.title);
        },
        'No outlines to delete.',
      );
      openDialogEl(deleteDialog);
    });
  }

  function onCancelOpen() {
    closeDialog(openDialog);
  }

  function onCancelDelete() {
    closeDialog(deleteDialog);
  }

  return {
    onOpen,
    onInsert,
    onDeleteMenu,
    openOutline,
    insertOutlineFromCloud,
    deleteOutline,
    showOutlinePicker,
    onCancelOpen,
    onCancelDelete,
  };
}
