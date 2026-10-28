/**
 * Cloud config helpers and outline deep-link URL utilities.
 *
 * Storage is Google Drive (see drive-cloud.js). Auth is Google Identity Services
 * (see auth-google.js). Configured when `googleClientId` is set.
 */

/**
 * @typedef {{ googleClientId?: string, clientId?: string }} CloudConfig
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

/**
 * Prefer `googleClientId`; accept legacy `clientId` alias.
 * @param {CloudConfig | null | undefined} config
 * @returns {string}
 */
export function googleClientIdFromConfig(config) {
  if (!config || typeof config !== 'object') return '';
  const id = config.googleClientId || config.clientId;
  return typeof id === 'string' ? id.trim() : '';
}

/** @param {CloudConfig | null | undefined} config */
export function isCloudConfigured(config) {
  return Boolean(googleClientIdFromConfig(config));
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
 * @param {{ readOnly?: boolean }} [options]
 */
export function locationWithOutlineId(locationLike, id, options = {}) {
  const params = new URLSearchParams(locationLike.search || '');
  if (id) params.set('id', id);
  else params.delete('id');
  if (options.readOnly) params.set('view', '1');
  else params.delete('view');
  params.delete('edit');
  const qs = params.toString();
  const path = locationLike.pathname || '/';
  const hash = locationLike.hash || '';
  return qs ? `${path}?${qs}${hash}` : `${path}${hash}`;
}

/**
 * Read-only share deep link (`?view=1` with an outline id).
 * @param {{ search?: string, hash?: string }} locationLike
 */
export function isReadOnlyViewFromLocation(locationLike) {
  const params = new URLSearchParams(locationLike.search || '');
  return params.get('view') === '1';
}
