import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clearCloudOutlineBinding } from '../cloud-binding.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('cloud outline binding', () => {
  it('clears Drive id, revision, lease, and URL when detaching', () => {
    const calls = {
      id: ['keep-me'],
      revision: [3],
      lease: ['lease-1'],
      url: ['keep-me'],
    };
    clearCloudOutlineBinding({
      setOutlineId: (id) => calls.id.push(id),
      setRevision: (rev) => calls.revision.push(rev),
      setLeaseToken: (tok) => calls.lease.push(tok),
      syncUrl: (id) => calls.url.push(id),
    });
    assert.deepEqual(calls.id, ['keep-me', null]);
    assert.deepEqual(calls.revision, [3, null]);
    assert.deepEqual(calls.lease, ['lease-1', null]);
    assert.deepEqual(calls.url, ['keep-me', null]);
  });

  it('File Open (replace) detaches the cloud binding so Save keeps the original Drive file', () => {
    const appJs = readFileSync(join(repoRoot, 'app.js'), 'utf8');
    assert.match(appJs, /clearCloudOutlineBinding/);
    assert.match(
      appJs,
      /function applyOpenedLocalOutline[\s\S]*clearCloudOutlineBinding/,
    );
    assert.doesNotMatch(
      appJs,
      /function applyOpenedLocalOutline[\s\S]*mode === 'insert'[\s\S]*clearCloudOutlineBinding/,
    );
  });
});
