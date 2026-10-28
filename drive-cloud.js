/**
 * Google Drive-backed outline storage (Tameware Outliner folder).
 */

import { CloudApiError } from './cloud.js';

export { CloudApiError };

export const APP_FOLDER_NAME = 'Tameware Outliner';
export const OPML_MIME = 'application/xml';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

/**
 * @param {object} options
 * @param {() => Promise<string | null | undefined>} options.getAccessToken
 * @param {typeof fetch} [options.fetch]
 * @param {string} [options.urlPathPrefix] prefix for share links (default /outliner/)
 * @param {string} [options.publicOutlineBase] same-origin proxy for anyone-with-link OPML
 * @param {string} [options.driveWriterServiceAccount] SA email granted on editable shares
 * @param {{ mode: 'view' | 'edit', token: string } | null} [options.shareAccess]
 *   When set, anonymous get/save use opaque view/edit proxy paths (not raw file ids).
 */
export function createDriveCloudClient({
  getAccessToken,
  fetch: fetchFn = globalThis.fetch,
  urlPathPrefix = '/outliner/',
  publicOutlineBase = '/api/outliner/drive/',
  driveWriterServiceAccount = '',
  shareAccess = null,
}) {
  /** @type {string | null} */
  let folderId = null;
  const publicBase = publicOutlineBase.endsWith('/')
    ? publicOutlineBase
    : `${publicOutlineBase}/`;
  const writerSa = String(driveWriterServiceAccount || '').trim();
  const share =
    shareAccess?.token && (shareAccess.mode === 'view' || shareAccess.mode === 'edit')
      ? { mode: shareAccess.mode, token: String(shareAccess.token) }
      : null;

  async function authHeader() {
    const token = await getAccessToken();
    if (!token) throw new CloudApiError('Not signed in', 401);
    return { Authorization: `Bearer ${token}` };
  }

  async function driveFetch(url, init = {}) {
    const headers = {
      ...(await authHeader()),
      ...(init.headers || {}),
    };
    const response = await fetchFn(url, { ...init, headers });
    if (!response.ok) {
      let body = null;
      const text = await response.text();
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      const detail =
        (body && typeof body === 'object' && (body.error?.message || body.error || body.message)) ||
        text ||
        response.statusText;
      throw new CloudApiError(String(detail || `HTTP ${response.status}`), response.status, body);
    }
    return response;
  }

  function titleFromName(name) {
    const n = String(name || 'Untitled');
    return n.replace(/\.opml$/i, '') || 'Untitled';
  }

  function fileNameForTitle(title) {
    const base = String(title || 'Untitled').trim() || 'Untitled';
    return /\.opml$/i.test(base) ? base : `${base}.opml`;
  }

  async function ensureAppFolder() {
    if (folderId) return folderId;
    const q = encodeURIComponent(
      `name = '${APP_FOLDER_NAME.replace(/'/g, "\\'")}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    );
    const listUrl = `${DRIVE_FILES}?q=${q}&fields=files(id,name)&pageSize=1`;
    const listed = await driveFetch(listUrl);
    const data = await listed.json();
    if (data.files?.length) {
      folderId = data.files[0].id;
      return folderId;
    }
    const created = await driveFetch(DRIVE_FILES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: APP_FOLDER_NAME,
        mimeType: FOLDER_MIME,
      }),
    });
    const meta = await created.json();
    folderId = meta.id;
    return folderId;
  }

  async function postPermission(fileId, body) {
    try {
      await driveFetch(`${DRIVE_FILES}/${encodeURIComponent(fileId)}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      // Already shared with this principal.
      if (error instanceof CloudApiError && error.status === 409) return;
      throw error;
    }
  }

  async function ensureAnyonePermission(fileId, role) {
    await postPermission(fileId, {
      type: 'anyone',
      role,
      allowFileDiscovery: false,
    });
  }

  async function ensureWriterServiceAccount(fileId) {
    if (!writerSa) return;
    await postPermission(fileId, {
      type: 'user',
      role: 'writer',
      emailAddress: writerSa,
      sendNotificationEmail: false,
    });
  }

  function shareUrlPath(mode, token) {
    const prefix = urlPathPrefix.endsWith('/') ? urlPathPrefix : `${urlPathPrefix}/`;
    const q = mode === 'view' ? 'view' : 'edit';
    return `${prefix}?${q}=${encodeURIComponent(token)}`;
  }

  /**
   * @param {'view' | 'edit'} mode
   * @param {string} fileId
   */
  async function mintShareLink(mode, fileId) {
    const access = await getAccessToken();
    if (!access) throw new CloudApiError('Not signed in', 401);
    let response;
    try {
      response = await fetchFn(`${publicBase}share`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId, mode }),
      });
    } catch (error) {
      throw new CloudApiError(error?.message || 'Failed to fetch', 0, error);
    }
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = await response.json();
        detail = body?.error || detail;
      } catch {
        /* ignore */
      }
      throw new CloudApiError(String(detail || `HTTP ${response.status}`), response.status);
    }
    const data = await response.json();
    const token = String(data.token || '');
    if (!token) throw new CloudApiError('Share mint returned no token', 502);
    return {
      token,
      urlPath: data.urlPath || shareUrlPath(mode, token),
    };
  }

  /**
   * Anyone-with-the-link files via same-origin proxy (avoids Drive CORS/CSP).
   * @param {string} id
   */
  async function getOutlinePublic(id) {
    const url = share
      ? `${publicBase}${share.mode}/${encodeURIComponent(share.token)}`
      : `${publicBase}${encodeURIComponent(id)}`;
    let response;
    try {
      response = await fetchFn(url, { redirect: 'follow' });
    } catch (error) {
      throw new CloudApiError(error?.message || 'Failed to fetch', 0, error);
    }
    if (!response.ok) {
      throw new CloudApiError(
        `Could not download shared outline (HTTP ${response.status})`,
        response.status,
      );
    }
    const opml = await response.text();
    const trimmed = opml.trimStart();
    if (!trimmed || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
      throw new CloudApiError('Sign in required to open this outline', 401);
    }
    const fileId = response.headers.get('X-Outliner-File-Id') || id;
    return { opml, revision: null, title: null, fileId };
  }

  /**
   * @param {string} id
   */
  async function getOutlineAuthed(id) {
    // Drive v3 File has no etag field; HTTP ETag is optional (often absent).
    const metaRes = await driveFetch(
      `${DRIVE_FILES}/${encodeURIComponent(id)}?fields=name`,
    );
    const meta = await metaRes.json();
    const media = await driveFetch(
      `${DRIVE_FILES}/${encodeURIComponent(id)}?alt=media`,
    );
    const opml = await media.text();
    const etag = media.headers.get('ETag') || metaRes.headers.get('ETag');
    return {
      opml,
      revision: etag || null,
      title: titleFromName(meta.name),
    };
  }

  return {
    async listOutlines() {
      const parent = await ensureAppFolder();
      const q = encodeURIComponent(
        `'${parent}' in parents and trashed = false and (mimeType = '${OPML_MIME}' or mimeType = 'text/xml' or mimeType = 'text/x-opml' or name contains '.opml')`,
      );
      const url = `${DRIVE_FILES}?q=${q}&fields=files(id,name)&orderBy=name&pageSize=100`;
      const response = await driveFetch(url);
      const data = await response.json();
      return (data.files || []).map((f) => ({
        id: f.id,
        title: titleFromName(f.name),
      }));
    },

    /**
     * @returns {Promise<{ opml: string, revision: string | null, title?: string | null }>}
     */
    async getOutline(id) {
      if (share) {
        return getOutlinePublic(id);
      }
      const token = await getAccessToken();
      if (!token) {
        return getOutlinePublic(id);
      }
      try {
        return await getOutlineAuthed(id);
      } catch (error) {
        // drive.file may not see another user's "anyone with the link" file.
        if (error instanceof CloudApiError && (error.status === 403 || error.status === 404)) {
          return getOutlinePublic(id);
        }
        throw error;
      }
    },

    async createOutline({ title, opml }) {
      const parent = await ensureAppFolder();
      const metadata = {
        name: fileNameForTitle(title),
        mimeType: OPML_MIME,
        parents: [parent],
      };
      const boundary = 'outliner_boundary';
      const body =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${OPML_MIME}\r\n\r\n` +
        `${opml}\r\n` +
        `--${boundary}--`;
      const response = await driveFetch(
        `${DRIVE_UPLOAD}?uploadType=multipart&fields=id`,
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body,
        },
      );
      const data = await response.json();
      return { id: data.id, revision: response.headers.get('ETag') || null };
    },

    async saveOutline(id, { opml, revision, title }) {
      if (share?.mode === 'view') {
        throw new CloudApiError('Read-only share', 403);
      }
      if (share?.mode === 'edit') {
        return saveOutlinePublic(id, opml);
      }
      const token = await getAccessToken();
      if (!token) {
        return saveOutlinePublic(id, opml);
      }
      try {
        return await saveOutlineAuthed(id, { opml, revision, title });
      } catch (error) {
        // drive.file cannot write another user's shared file — use SA proxy.
        if (error instanceof CloudApiError && (error.status === 403 || error.status === 404)) {
          return saveOutlinePublic(id, opml);
        }
        throw error;
      }
    },

    async acquireLock() {
      return { token: 'drive', leaseUntil: '' };
    },

    async releaseLock() {},

    /**
     * Move an outline to Google Drive trash.
     * @param {string} id
     */
    async deleteOutline(id) {
      await driveFetch(`${DRIVE_FILES}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      });
    },

    async createShareLink(id) {
      await ensureAnyonePermission(id, 'reader');
      return mintShareLink('view', id);
    },

    async createEditShareLink(id) {
      await ensureAnyonePermission(id, 'writer');
      await ensureWriterServiceAccount(id);
      return mintShareLink('edit', id);
    },
  };

  async function saveOutlinePublic(id, opml) {
    const url =
      share?.mode === 'edit'
        ? `${publicBase}edit/${encodeURIComponent(share.token)}`
        : `${publicBase}${encodeURIComponent(id)}`;
    let response;
    try {
      response = await fetchFn(url, {
        method: 'PUT',
        headers: { 'Content-Type': OPML_MIME },
        body: opml,
      });
    } catch (error) {
      throw new CloudApiError(error?.message || 'Failed to fetch', 0, error);
    }
    if (!response.ok) {
      throw new CloudApiError(
        `Could not save shared outline (HTTP ${response.status})`,
        response.status,
      );
    }
    const fileId = response.headers.get('X-Outliner-File-Id') || id;
    return { id: fileId, revision: null };
  }

  async function saveOutlineAuthed(id, { opml, revision, title }) {
    if (title) {
      await driveFetch(`${DRIVE_FILES}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fileNameForTitle(title) }),
      });
    }
    const headers = { 'Content-Type': OPML_MIME };
    if (revision != null && revision !== '') headers['If-Match'] = String(revision);
    const response = await driveFetch(
      `${DRIVE_UPLOAD}/${encodeURIComponent(id)}?uploadType=media&fields=id`,
      {
        method: 'PATCH',
        headers,
        body: opml,
      },
    );
    const data = await response.json();
    return { id: data.id || id, revision: response.headers.get('ETag') || null };
  }
}
