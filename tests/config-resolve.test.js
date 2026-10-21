import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCloudConfig } from '../cloud.js';

describe('resolveCloudConfig', () => {
  it('uses the base config when no local override exists', () => {
    assert.equal(resolveCloudConfig(null, undefined), null);
    assert.deepEqual(
      resolveCloudConfig({ apiBase: 'https://a.example' }, undefined),
      { apiBase: 'https://a.example' },
    );
  });

  it('prefers a local override when provided', () => {
    assert.deepEqual(
      resolveCloudConfig(
        { apiBase: 'https://public.example' },
        { apiBase: 'https://local.example', firebase: { apiKey: 'secret' } },
      ),
      { apiBase: 'https://local.example', firebase: { apiKey: 'secret' } },
    );
  });

  it('treats explicit local null as local-only', () => {
    assert.equal(
      resolveCloudConfig({ apiBase: 'https://a.example' }, null),
      null,
    );
  });
});
