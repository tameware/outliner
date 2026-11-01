import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNullCloudClient, bootCloud } from '../src/cloud/boot.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('cloud boot', () => {
  it('createNullCloudClient returns a no-op Drive client', async () => {
    const cloud = createNullCloudClient();
    assert.deepEqual(await cloud.listOutlines(), []);
    assert.equal((await cloud.createOutline()).id, 'local');
    assert.deepEqual(await cloud.getOutline(), { opml: '', revision: null });
    await cloud.releaseLock();
    await cloud.deleteOutline();
  });

  it('bootCloud skips Google auth for opaque share links', async () => {
    const calls = [];
    const result = await bootCloud({
      loadCloudConfig: async () => ({ googleClientId: 'client.apps.googleusercontent.com' }),
      isCloudConfigured: () => true,
      googleClientIdFromConfig: () => 'client.apps.googleusercontent.com',
      driveWriterServiceAccountFromConfig: () => null,
      createGoogleAuth: () => {
        calls.push('google');
        return { getAccessToken: () => null };
      },
      createNullAuth: () => {
        calls.push('null');
        return { getAccessToken: () => null };
      },
      createDriveCloudClient: () => ({ kind: 'drive' }),
      mountCloudUi: (opts) => {
        calls.push(['mount', opts.editShareMode, opts.readOnlyView]);
        return { syncSaveState() {} };
      },
      editShareToken: 'edit-token',
      viewShareToken: null,
      readOnlyShare: false,
      editShareMode: true,
      outlineFacade: { root: {} },
      onSynced: () => {},
      bindDeepLink: null,
    });
    assert.deepEqual(calls, ['null', ['mount', true, false]]);
    assert.equal(result.cloudSaveAvailable, true);
    assert.ok(result.cloudUi);
  });

  it('is wired from app.js', () => {
    const appJs = readFileSync(join(repoRoot, 'src/app.js'), 'utf8');
    assert.match(appJs, /bootCloud/);
    assert.match(appJs, /from ['"]\.\/cloud\/boot\.js['"]/);
  });
});
