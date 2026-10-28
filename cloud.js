/**
 * Cloud config helpers and outline deep-link URL utilities.
 *
 * Storage is Google Drive (see drive-cloud.js). Auth is Google Identity Services
 * (see auth-google.js). Configured when `googleClientId` is set.
 */

/**
 * @typedef {{
 *   googleClientId?: string,
 *   clientId?: string,
 *   driveWriterServiceAccount?: string,
 * }} CloudConfig
 */

/**
 * Service account email used for editable share-link writes via the proxy.
 * @param {CloudConfig | null | undefined} config
 * @returns {string}
 */
export function driveWriterServiceAccountFromConfig(config) {
  if (!config || typeof config !== 'object') return '';
  const email = config.driveWriterServiceAccount;
  return typeof email === 'string' ? email.trim() : '';
}

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
 * Opaque read-only share token (`?view=<token>`). Ignores legacy `view=1`.
 * @param {{ search?: string, hash?: string }} locationLike
 * @returns {string | null}
 */
export function viewTokenFromLocation(locationLike) {
  const params = new URLSearchParams(locationLike.search || '');
  const view = params.get('view');
  if (!view || !view.trim() || view.trim() === '1') return null;
  return view.trim();
}

/**
 * Opaque editable share token (`?edit=<token>`).
 * @param {{ search?: string, hash?: string }} locationLike
 * @returns {string | null}
 */
export function editTokenFromLocation(locationLike) {
  const params = new URLSearchParams(locationLike.search || '');
  const edit = params.get('edit');
  return edit && edit.trim() ? edit.trim() : null;
}

/**
 * Owner deep link after open/save (`?id=`). Clears share tokens.
 * @param {{ pathname?: string, search?: string, hash?: string }} locationLike
 * @param {string | null} id
 */
export function locationWithOutlineId(locationLike, id) {
  const params = new URLSearchParams(locationLike.search || '');
  if (id) params.set('id', id);
  else params.delete('id');
  params.delete('view');
  params.delete('edit');
  const qs = params.toString();
  const path = locationLike.pathname || '/';
  const hash = locationLike.hash || '';
  return qs ? `${path}?${qs}${hash}` : `${path}${hash}`;
}

/**
 * Read-only share deep link (`?view=<opaque token>`).
 * @param {{ search?: string, hash?: string }} locationLike
 */
export function isReadOnlyViewFromLocation(locationLike) {
  return Boolean(viewTokenFromLocation(locationLike));
}

/**
 * Editable share deep link (`?edit=<opaque token>`).
 * Bare `?id=` is an owner bookmark, not a guest edit share.
 * @param {{ search?: string, hash?: string }} locationLike
 */
export function isEditableShareFromLocation(locationLike) {
  return Boolean(editTokenFromLocation(locationLike));
}
