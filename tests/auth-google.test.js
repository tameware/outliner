import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleAuth, createNullAuth, DRIVE_SCOPE } from '../auth-google.js';

describe('Google Identity Services auth', () => {
  beforeEach(() => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ name: 'Ada', email: 'ada@example.com', sub: 'uid-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
  });

  it('requests a Drive-scoped access token and exposes the user', async () => {
    const requests = [];
    const tokenClient = {
      callback: () => {},
      requestAccessToken(opts) {
        requests.push(opts);
        queueMicrotask(() => {
          tokenClient.callback({ access_token: 'tok-abc', expires_in: 3600 });
        });
      },
    };
    const google = {
      accounts: {
        oauth2: {
          initTokenClient(config) {
            tokenClient.callback = config.callback;
            tokenClient.error_callback = config.error_callback;
            assert.equal(config.client_id, 'client.apps.googleusercontent.com');
            assert.match(config.scope, new RegExp(DRIVE_SCOPE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
            assert.match(config.scope, /openid/);
            assert.match(config.scope, /email/);
            assert.match(config.scope, /profile/);
            assert.equal(typeof config.error_callback, 'function');
            return tokenClient;
          },
          revoke() {},
        },
      },
    };

    const auth = createGoogleAuth({
      clientId: 'client.apps.googleusercontent.com',
      google,
    });

    let seen = null;
    auth.onAuthStateChanged((user) => {
      seen = user;
    });
    assert.equal(seen, null);

    await auth.signInWithGoogle();
    assert.equal(await auth.getAccessToken(), 'tok-abc');
    assert.equal(seen.email, 'ada@example.com');
    assert.equal(seen.displayName, 'Ada');
    assert.ok(requests.length >= 1);
  });

  it('rejects sign-in when GIS reports a popup error via error_callback', async () => {
    const tokenClient = {
      callback: () => {},
      error_callback: () => {},
      requestAccessToken() {
        queueMicrotask(() => {
          tokenClient.error_callback({ type: 'popup_closed' });
        });
      },
    };
    const google = {
      accounts: {
        oauth2: {
          initTokenClient(config) {
            tokenClient.callback = config.callback;
            tokenClient.error_callback = config.error_callback;
            return tokenClient;
          },
          revoke() {},
        },
      },
    };
    const auth = createGoogleAuth({
      clientId: 'client.apps.googleusercontent.com',
      google,
    });
    await assert.rejects(() => auth.signInWithGoogle(), /popup_closed|sign-in/i);
  });

  it('createNullAuth refuses sign-in and has no token', async () => {
    const auth = createNullAuth();
    assert.equal(await auth.getAccessToken(), null);
    await assert.rejects(() => auth.signInWithGoogle(), /not configured/i);
  });

  it('removes a failed GIS script tag so the next sign-in retries the download', async () => {
    const { JSDOM } = await import('jsdom');
    const { createGoogleAuth: createAuth } = await import('../auth-google.js');
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;

    // Force ensureClient to try loading the GIS script (no google global).
    delete globalThis.google;

    const auth = createAuth({
      clientId: 'client.apps.googleusercontent.com',
      google: null,
    });

    // Intercept script append to fail onerror.
    const origCreate = document.createElement.bind(document);
    document.createElement = (tag) => {
      const el = origCreate(tag);
      if (tag === 'script') {
        queueMicrotask(() => {
          el.onerror?.(new Event('error'));
        });
      }
      return el;
    };

    await assert.rejects(() => auth.signInWithGoogle(), /Failed to load Google Identity Services/);
    assert.equal(
      document.querySelectorAll('script[src="https://accounts.google.com/gsi/client"]').length,
      0,
      'failed script must be removed so retry can re-download',
    );
  });
});
