import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCloudConfig } from '../cloud.js';

describe('resolveCloudConfig', () => {
  it('uses the base config when no local override exists', () => {
    assert.equal(resolveCloudConfig(null, undefined), null);
    assert.deepEqual(
      resolveCloudConfig({ googleClientId: 'a.apps.googleusercontent.com' }, undefined),
      { googleClientId: 'a.apps.googleusercontent.com' },
    );
  });

  it('prefers an explicit local config including null', () => {
    assert.deepEqual(
      resolveCloudConfig(
        { googleClientId: 'public.apps.googleusercontent.com' },
        { googleClientId: 'local.apps.googleusercontent.com' },
      ),
      { googleClientId: 'local.apps.googleusercontent.com' },
    );
    assert.equal(
      resolveCloudConfig({ googleClientId: 'a.apps.googleusercontent.com' }, null),
      null,
    );
  });
});
