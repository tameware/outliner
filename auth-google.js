/**
 * Google Identity Services (GIS) token client for Drive access.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
/** OpenID scopes so userinfo can return sub / name / email after a fresh grant. */
export const IDENTITY_SCOPES = 'openid profile email';
export const AUTH_SCOPES = `${DRIVE_SCOPE} ${IDENTITY_SCOPES}`;

const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';

/**
 * @param {string} src
 * @returns {Promise<void>}
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(el);
  });
}

/**
 * @param {object} options
 * @param {string} options.clientId
 * @param {object} [options.google] GIS global (tests); default window.google after script load
 * @param {typeof fetch} [options.fetch]
 */
export function createGoogleAuth({
  clientId,
  google: googleNs,
  fetch: fetchFn = globalThis.fetch,
}) {
  /** @type {string | null} */
  let accessToken = null;
  /** @type {object | null} */
  let profile = null;
  /** @type {Set<(user: object | null) => void>} */
  const listeners = new Set();
  /** @type {ReturnType<typeof setTimeout> | null} */
  let expiryTimer = null;
  /** @type {any} */
  let tokenClient = null;

  function emit() {
    const user = accessToken
      ? {
          uid: profile?.sub || profile?.id || 'google',
          displayName: profile?.name || profile?.email || 'Signed in',
          email: profile?.email || '',
        }
      : null;
    for (const cb of listeners) cb(user);
  }

  function clearExpiry() {
    if (expiryTimer) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }
  }

  async function fetchProfile(token) {
    const response = await fetchFn('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      profile = { name: 'Signed in' };
      return;
    }
    profile = await response.json();
  }

  /**
   * @param {{ access_token?: string, expires_in?: number, error?: string }} response
   */
  async function applyTokenResponse(response) {
    if (response.error || !response.access_token) {
      throw new Error(response.error || 'Google sign-in failed');
    }
    accessToken = response.access_token;
    clearExpiry();
    const seconds = Number(response.expires_in) || 3600;
    expiryTimer = setTimeout(() => {
      accessToken = null;
      profile = null;
      emit();
    }, Math.max(30, seconds - 60) * 1000);
    if (typeof expiryTimer === 'object' && expiryTimer && 'unref' in expiryTimer) {
      expiryTimer.unref();
    }
    await fetchProfile(accessToken);
    emit();
  }

  async function ensureClient() {
    if (tokenClient) return tokenClient;
    const google = googleNs || globalThis.google;
    if (!google?.accounts?.oauth2?.initTokenClient) {
      await loadScript(GIS_SCRIPT);
    }
    const g = googleNs || globalThis.google;
    if (!g?.accounts?.oauth2?.initTokenClient) {
      throw new Error('Google Identity Services is unavailable');
    }
    tokenClient = g.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: AUTH_SCOPES,
      callback: () => {},
      error_callback: () => {},
    });
    return tokenClient;
  }

  return {
    onAuthStateChanged(cb) {
      listeners.add(cb);
      cb(
        accessToken
          ? {
              uid: profile?.sub || 'google',
              displayName: profile?.name || profile?.email || 'Signed in',
              email: profile?.email || '',
            }
          : null,
      );
      return () => listeners.delete(cb);
    },

    async signInWithGoogle() {
      const client = await ensureClient();
      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, value) => {
          if (settled) return;
          settled = true;
          fn(value);
        };
        client.callback = (response) => {
          applyTokenResponse(response).then((v) => finish(resolve, v)).catch((e) => finish(reject, e));
        };
        client.error_callback = (error) => {
          const message =
            (error && typeof error === 'object' && (error.type || error.message)) ||
            'Google sign-in failed';
          finish(reject, new Error(String(message)));
        };
        client.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
      });
      return {
        uid: profile?.sub || 'google',
        displayName: profile?.name || profile?.email || 'Signed in',
        email: profile?.email || '',
      };
    },

    async signOut() {
      clearExpiry();
      const token = accessToken;
      accessToken = null;
      profile = null;
      const g = googleNs || globalThis.google;
      if (token && g?.accounts?.oauth2?.revoke) {
        await new Promise((resolve) => {
          g.accounts.oauth2.revoke(token, () => resolve());
        });
      }
      emit();
    },

    async getAccessToken() {
      return accessToken;
    },

    /** @deprecated use getAccessToken — kept for older call sites */
    async getIdToken() {
      return accessToken;
    },
  };
}

/** Auth stub when Google client id is not configured. */
export function createNullAuth() {
  return {
    onAuthStateChanged(cb) {
      cb(null);
      return () => {};
    },
    async signInWithGoogle() {
      throw new Error('Cloud auth is not configured');
    },
    async signOut() {},
    async getAccessToken() {
      return null;
    },
    async getIdToken() {
      return null;
    },
  };
}
