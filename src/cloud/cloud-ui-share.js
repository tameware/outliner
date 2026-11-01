/**
 * Cloud share-link creation (read-only + editable).
 */

/**
 * @param {string} urlPath
 * @param {string} [origin]
 */
export function absoluteShareUrl(urlPath, origin = window.location.origin) {
  try {
    return new URL(urlPath, origin).href;
  } catch {
    return urlPath;
  }
}

/**
 * @param {{
 *   outline: object,
 *   cloud: object,
 *   withBusy: (label: string, fn: () => Promise<void>) => Promise<boolean>,
 *   setStatus: (message: string) => void,
 *   rememberDriveFileId: (id: string | null) => void,
 *   getActiveDriveFileId: () => string | null,
 * }} deps
 */
export function createCloudShareController(deps) {
  const {
    outline,
    cloud,
    withBusy,
    setStatus,
    rememberDriveFileId,
    getActiveDriveFileId,
  } = deps;

  /**
   * @param {{ urlPath: string }} result
   * @param {string} copiedLabel
   */
  async function copyShareLink(result, copiedLabel) {
    const href = absoluteShareUrl(result.urlPath);
    try {
      await navigator.clipboard.writeText(href);
      setStatus(copiedLabel);
    } catch {
      window.prompt('Copy this link:', href);
      setStatus(copiedLabel.replace(/copied$/i, 'ready'));
    }
  }

  /**
   * @param {'view' | 'edit'} kind
   * @returns {string | null}
   */
  function requireSavedOutline(kind) {
    const boundId = outline.getOutlineId?.() || null;
    // File Open clears the Drive binding — drop any remembered id too.
    if (!boundId) {
      rememberDriveFileId(null);
      window.alert(
        kind === 'edit'
          ? 'Save this outline to Google Drive before creating an editable link.'
          : 'Save this outline to Google Drive before creating a read-only link.',
      );
      return null;
    }
    if (outline.isDirty?.()) {
      window.alert(
        kind === 'edit'
          ? 'Save this outline to Google Drive before creating an editable link.'
          : 'Save this outline to Google Drive before creating a read-only link.',
      );
      return null;
    }
    // Prefer the last Cloud Open/Save id when getOutlineId was clobbered (stale deep-link).
    const id = getActiveDriveFileId() || boundId;
    if (boundId !== id) {
      outline.setOutlineId?.(id);
      if (outline.syncUrl) outline.syncUrl(id);
    }
    return id;
  }

  async function onShare() {
    const id = requireSavedOutline('view');
    if (!id) return;
    /** @type {{ urlPath: string } | undefined} */
    let result;
    const ok = await withBusy('Creating link…', async () => {
      result = await cloud.createShareLink(id);
    });
    if (ok && result) await copyShareLink(result, 'Read-only link copied');
  }

  async function onShareEdit() {
    const id = requireSavedOutline('edit');
    if (!id) return;
    /** @type {{ urlPath: string } | undefined} */
    let result;
    const ok = await withBusy('Creating link…', async () => {
      result = await cloud.createEditShareLink(id);
    });
    if (ok && result) await copyShareLink(result, 'Editable link copied');
  }

  return {
    onShare,
    onShareEdit,
    requireSavedOutline,
    copyShareLink,
  };
}
