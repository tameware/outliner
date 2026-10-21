import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCloudConfigured,
  createCloudClient,
  CloudApiError,
  outlineIdFromLocation,
  locationWithOutlineId,
} from '../cloud.js';

describe('cloud config', () => {
  it('is disabled when config is null or missing apiBase', () => {
    assert.equal(isCloudConfigured(null), false);
    assert.equal(isCloudConfigured({}), false);
    assert.equal(isCloudConfigured({ apiBase: '' }), false);
    assert.equal(isCloudConfigured({ apiBase: 'https://example.com' }), true);
  });
});

describe('outline id in URL', () => {
  it('reads id from query string', () => {
    assert.equal(
      outlineIdFromLocation({ search: '?id=abc123', hash: '' }),
      'abc123',
    );
    assert.equal(outlineIdFromLocation({ search: '', hash: '' }), null);
  });

  it('builds a URL that carries the outline id', () => {
    const href = locationWithOutlineId(
      { pathname: '/outliner/', search: '', hash: '' },
      'xyz',
    );
    assert.equal(href, '/outliner/?id=xyz');
  });
});

describe('cloud API client', () => {
  let fetchMock;
  let tokens;

  beforeEach(() => {
    tokens = ['tok-1'];
    fetchMock = mock.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  function client() {
    return createCloudClient({
      apiBase: 'https://api.example.com',
      getIdToken: async () => tokens[0],
      fetch: fetchMock,
    });
  }

  it('lists outlines with a bearer token', async () => {
    fetchMock.mock.mockImplementation(async () => {
      return new Response(JSON.stringify({ outlines: [{ id: 'a', title: 'A' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const list = await client().listOutlines();
    assert.deepEqual(list, [{ id: 'a', title: 'A' }]);
    assert.equal(fetchMock.mock.calls.length, 1);
    const [url, init] = fetchMock.mock.calls[0].arguments;
    assert.equal(url, 'https://api.example.com/api/outlines');
    assert.equal(init.headers.Authorization, 'Bearer tok-1');
  });

  it('creates an outline from OPML and returns the new id', async () => {
    fetchMock.mock.mockImplementation(async () => {
      return new Response(JSON.stringify({ id: 'new-1', revision: 1 }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const result = await client().createOutline({
      title: 'Demo',
      opml: '<?xml version="1.0"?><opml></opml>',
    });
    assert.equal(result.id, 'new-1');
    const [url, init] = fetchMock.mock.calls[0].arguments;
    assert.equal(url, 'https://api.example.com/api/outlines');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['Content-Type'], 'application/xml');
    assert.match(init.body, /<opml>/);
  });

  it('saves OPML to an existing outline', async () => {
    fetchMock.mock.mockImplementation(async () => {
      return new Response(JSON.stringify({ id: 'abc', revision: 2 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    await client().saveOutline('abc', {
      opml: '<opml></opml>',
      revision: 1,
    });
    const [url, init] = fetchMock.mock.calls[0].arguments;
    assert.equal(url, 'https://api.example.com/api/outlines/abc');
    assert.equal(init.method, 'PUT');
    assert.equal(init.headers['If-Match'], '1');
  });

  it('loads outline OPML as text', async () => {
    fetchMock.mock.mockImplementation(async () => {
      return new Response('<?xml version="1.0"?><opml version="2.0"></opml>', {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      });
    });
    const opml = await client().getOutline('abc');
    assert.match(opml, /<opml/);
    const [url] = fetchMock.mock.calls[0].arguments;
    assert.equal(url, 'https://api.example.com/api/outlines/abc');
  });

  it('acquires and releases an edit lock', async () => {
    fetchMock.mock.mockImplementation(async (url, init) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ token: 'lease-1', leaseUntil: '2099-01-01' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 204 });
    });
    const c = client();
    const lease = await c.acquireLock('abc');
    assert.equal(lease.token, 'lease-1');
    await c.releaseLock('abc', 'lease-1');
    assert.equal(fetchMock.mock.calls[0].arguments[0], 'https://api.example.com/api/outlines/abc/lock');
    assert.equal(fetchMock.mock.calls[1].arguments[1].method, 'DELETE');
  });

  it('throws CloudApiError on non-OK responses', async () => {
    fetchMock.mock.mockImplementation(async () => {
      return new Response(JSON.stringify({ error: 'locked' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    await assert.rejects(() => client().acquireLock('abc'), (err) => {
      assert.ok(err instanceof CloudApiError);
      assert.equal(err.status, 409);
      assert.match(err.message, /locked|409/);
      return true;
    });
  });

  it('strips trailing slash on apiBase', async () => {
    fetchMock.mock.mockImplementation(async () => {
      return new Response(JSON.stringify({ outlines: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    await createCloudClient({
      apiBase: 'https://api.example.com/',
      getIdToken: async () => 'tok',
      fetch: fetchMock,
    }).listOutlines();
    assert.equal(fetchMock.mock.calls[0].arguments[0], 'https://api.example.com/api/outlines');
  });
});
