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
            assert.equal(config.client_id, 'client.apps.googleusercontent.com');
            assert.match(config.scope, new RegExp(DRIVE_SCOPE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
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

  it('createNullAuth refuses sign-in and has no token', async () => {
    const auth = createNullAuth();
    assert.equal(await auth.getAccessToken(), null);
    await assert.rejects(() => auth.signInWithGoogle(), /not configured/i);
  });
});
