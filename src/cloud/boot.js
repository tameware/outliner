import {
  isCloudConfigured as isCloudConfiguredDefault,
  googleClientIdFromConfig as googleClientIdFromConfigDefault,
  driveWriterServiceAccountFromConfig as driveWriterServiceAccountFromConfigDefault,
  loadCloudConfig as loadCloudConfigDefault,
} from './cloud.js';
import { createDriveCloudClient as createDriveCloudClientDefault } from './drive-cloud.js';
import { mountCloudUi as mountCloudUiDefault } from './cloud-ui.js';
import {
  createGoogleAuth as createGoogleAuthDefault,
  createNullAuth as createNullAuthDefault,
} from './auth-google.js';

/** No-op Drive client used when cloud is not configured. */
export function createNullCloudClient() {
  return {
    async listOutlines() {
      return [];
    },
    async getOutline() {
      return { opml: '', revision: null };
    },
    async createOutline() {
      return { id: 'local' };
    },
    async saveOutline() {
      return {};
    },
    async acquireLock() {
      return { token: '' };
    },
    async releaseLock() {},
    async createShareLink() {
      return { token: '', urlPath: '' };
    },
    async createEditShareLink() {
      return { token: '', urlPath: '' };
    },
    async deleteOutline() {},
  };
}

/**
 * Boot optional Google Drive auth + Cloud UI (+ optional deep-link load).
 *
 * @param {{
 *   loadCloudConfig?: typeof loadCloudConfigDefault,
 *   isCloudConfigured?: typeof isCloudConfiguredDefault,
 *   googleClientIdFromConfig?: typeof googleClientIdFromConfigDefault,
 *   driveWriterServiceAccountFromConfig?: typeof driveWriterServiceAccountFromConfigDefault,
 *   createGoogleAuth?: typeof createGoogleAuthDefault,
 *   createNullAuth?: typeof createNullAuthDefault,
 *   createDriveCloudClient?: typeof createDriveCloudClientDefault,
 *   mountCloudUi?: typeof mountCloudUiDefault,
 *   editShareToken?: string | null,
 *   viewShareToken?: string | null,
 *   readOnlyShare?: boolean,
 *   editShareMode?: boolean,
 *   outlineFacade: object,
 *   onSynced?: () => void,
 *   bindDeepLink?: (ctx: {
 *     auth: object,
 *     cloud: object,
 *     configured: boolean,
 *   }) => { invalidate?: () => void } | null | undefined,
 *   applyReadOnly?: () => void,
 * }} options
 */
export async function bootCloud(options) {
  const loadCloudConfig = options.loadCloudConfig ?? loadCloudConfigDefault;
  const isCloudConfigured = options.isCloudConfigured ?? isCloudConfiguredDefault;
  const googleClientIdFromConfig =
    options.googleClientIdFromConfig ?? googleClientIdFromConfigDefault;
  const driveWriterServiceAccountFromConfig =
    options.driveWriterServiceAccountFromConfig ??
    driveWriterServiceAccountFromConfigDefault;
  const createGoogleAuth = options.createGoogleAuth ?? createGoogleAuthDefault;
  const createNullAuth = options.createNullAuth ?? createNullAuthDefault;
  const createDriveCloudClient =
    options.createDriveCloudClient ?? createDriveCloudClientDefault;
  const mountCloudUi = options.mountCloudUi ?? mountCloudUiDefault;

  const editShareToken = options.editShareToken ?? null;
  const viewShareToken = options.viewShareToken ?? null;
  const readOnlyShare = Boolean(options.readOnlyShare);
  const editShareMode = Boolean(options.editShareMode);

  const cloudConfig = await loadCloudConfig();
  const configured = isCloudConfigured(cloudConfig);
  let auth = createNullAuth();
  let cloud = null;

  if (configured) {
    // Opaque ?edit= / ?view= shares never use a Google account — skip GIS entirely.
    const guestShare = Boolean(editShareToken || viewShareToken);
    if (!guestShare) {
      auth = createGoogleAuth({ clientId: googleClientIdFromConfig(cloudConfig) });
    }
    cloud = createDriveCloudClient({
      getAccessToken: () => auth.getAccessToken(),
      driveWriterServiceAccount: driveWriterServiceAccountFromConfig(cloudConfig),
      shareAccess: editShareToken
        ? { mode: 'edit', token: editShareToken }
        : viewShareToken
          ? { mode: 'view', token: viewShareToken }
          : null,
    });
  }

  const cloudUi = mountCloudUi({
    configured,
    readOnlyView: readOnlyShare,
    editShareMode,
    auth,
    cloud: cloud || createNullCloudClient(),
    outline: options.outlineFacade,
  });
  options.onSynced?.();

  if (readOnlyShare) options.applyReadOnly?.();

  let deepLinkLoad = null;
  if (configured && cloud && options.bindDeepLink) {
    deepLinkLoad =
      options.bindDeepLink({ auth, cloud, configured }) ?? null;
  }

  return {
    cloudSaveAvailable: configured,
    cloudUi,
    deepLinkLoad,
    auth,
    cloud,
  };
}
