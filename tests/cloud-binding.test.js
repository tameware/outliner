import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearCloudOutlineBinding } from '../src/cloud/cloud-binding.js';


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

});
