/**
 * Optional cloud save/restore client for a GCP (or compatible) backend.
 *
 * Expected API (Bearer Firebase / Google ID token):
 *   GET    /api/outlines
 *   POST   /api/outlines          body: OPML, header X-Outline-Title optional
 *   GET    /api/outlines/:id      body: OPML
 *   PUT    /api/outlines/:id      body: OPML, If-Match: revision
 *   POST   /api/outlines/:id/lock
 *   DELETE /api/outlines/:id/lock header X-Lease-Token
 */

/**
 * @typedef {{ apiBase: string, firebase?: object }} CloudConfig
 */

export class CloudApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {unknown} [body]
   */
  constructor(message, status, body) {
    super(message);
    this.name = 'CloudApiError';
    this.status = status;
    this.body = body;
  }
}

/** @param {CloudConfig | null | undefined} config */
export function isCloudConfigured(config) {
  return Boolean(config && typeof config.apiBase === 'string' && config.apiBase.trim());
}

/**
 * Merge committed config with an optional gitignored local override.
 * If `local` is passed (including `null`), it wins; otherwise `base` is used.
 * @param {CloudConfig | null | undefined} base
 * @param {CloudConfig | null | undefined} [local]
 */
export function resolveCloudConfig(base, local) {
  if (local !== undefined) return local;
  return base ?? null;
}

/**
 * Load `./config.js` then optional `./config.local.js` (404 → ignore).
 * @param {(specifier: string) => Promise<{ default: CloudConfig | null }>} [importer]
 */
export async function loadCloudConfig(importer = (specifier) => import(specifier)) {
  const baseMod = await importer('./config.js');
  try {
    const localMod = await importer('./config.local.js');
    return resolveCloudConfig(baseMod.default, localMod.default);
  } catch {
    return resolveCloudConfig(baseMod.default, undefined);
  }
}

function normalizeBase(apiBase) {
  return String(apiBase).replace(/\/+$/, '');
}

/**
 * @param {{ search?: string, hash?: string }} locationLike
 * @returns {string | null}
 */
export function outlineIdFromLocation(locationLike) {
  const params = new URLSearchParams(locationLike.search || '');
  const id = params.get('id');
  return id && id.trim() ? id.trim() : null;
}

/**
 * @param {{ pathname?: string, search?: string, hash?: string }} locationLike
 * @param {string | null} id
 */
export function locationWithOutlineId(locationLike, id) {
  const params = new URLSearchParams(locationLike.search || '');
  if (id) params.set('id', id);
  else params.delete('id');
  const qs = params.toString();
  const path = locationLike.pathname || '/';
  const hash = locationLike.hash || '';
  return qs ? `${path}?${qs}${hash}` : `${path}${hash}`;
}

/**
 * @param {object} options
 * @param {string} options.apiBase
 * @param {() => Promise<string | null | undefined>} options.getIdToken
 * @param {typeof fetch} [options.fetch]
 */
export function createCloudClient({ apiBase, getIdToken, fetch: fetchFn = globalThis.fetch }) {
  const base = normalizeBase(apiBase);

  async function authHeaders(extra = {}) {
    const token = await getIdToken();
    if (!token) {
      throw new CloudApiError('Not signed in', 401);
    }
    return {
      Authorization: `Bearer ${token}`,
      ...extra,
    };
  }

  async function request(path, init = {}) {
    const headers = await authHeaders(init.headers || {});
    const response = await fetchFn(`${base}${path}`, { ...init, headers });
    if (!response.ok) {
      let body = null;
      const text = await response.text();
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      const detail =
        (body && typeof body === 'object' && (body.error || body.message)) ||
        text ||
        response.statusText;
      throw new CloudApiError(String(detail || `HTTP ${response.status}`), response.status, body);
    }
    if (response.status === 204) return null;
    const type = response.headers.get('Content-Type') || '';
    if (type.includes('json')) return response.json();
    return response.text();
  }

  return {
    async listOutlines() {
      const data = await request('/api/outlines');
      return data?.outlines ?? data ?? [];
    },

    async getOutline(id) {
      return request(`/api/outlines/${encodeURIComponent(id)}`);
    },

    async createOutline({ title, opml }) {
      return request('/api/outlines', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          ...(title ? { 'X-Outline-Title': title } : {}),
        },
        body: opml,
      });
    },

    async saveOutline(id, { opml, revision, leaseToken, title }) {
      const headers = {
        'Content-Type': 'application/xml',
      };
      if (revision != null) headers['If-Match'] = String(revision);
      if (leaseToken) headers['X-Lease-Token'] = leaseToken;
      if (title) headers['X-Outline-Title'] = title;
      return request(`/api/outlines/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers,
        body: opml,
      });
    },

    async acquireLock(id) {
      return request(`/api/outlines/${encodeURIComponent(id)}/lock`, {
        method: 'POST',
      });
    },

    async releaseLock(id, leaseToken) {
      return request(`/api/outlines/${encodeURIComponent(id)}/lock`, {
        method: 'DELETE',
        headers: leaseToken ? { 'X-Lease-Token': leaseToken } : {},
      });
    },
  };
}
