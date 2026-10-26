import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCloudConfigured,
  createCloudClient,
  CloudApiError,
  outlineIdFromLocation,
  locationWithOutlineId,
  viewTokenFromLocation,
  locationWithViewToken,
  editTokenFromLocation,
  locationWithEditToken,
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
      { pathname: '/outliner/', search: '?view=v&edit=e', hash: '' },
      'xyz',
    );
    assert.equal(href, '/outliner/?id=xyz');
  });
});

describe('view token in URL', () => {
  it('reads and builds a read-only view query param', () => {
    assert.equal(
      viewTokenFromLocation({ search: '?view=share-tok', hash: '' }),
      'share-tok',
    );
    assert.equal(
      locationWithViewToken({ pathname: '/outliner/', search: '?id=x&edit=e', hash: '' }, 'abc'),
      '/outliner/?view=abc',
    );
  });
});

describe('edit token in URL', () => {
  it('reads and builds an editable share query param', () => {
    assert.equal(
      editTokenFromLocation({ search: '?edit=edit-tok', hash: '' }),
      'edit-tok',
    );
    assert.equal(editTokenFromLocation({ search: '', hash: '' }), null);
    assert.equal(
      locationWithEditToken(
        { pathname: '/outliner/', search: '?id=x&view=v', hash: '' },
        'abc',
      ),
      '/outliner/?edit=abc',
    );
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

  it('loads outline OPML with revision from response headers', async () => {
    fetchMock.mock.mockImplementation(async () => {
      return new Response('<?xml version="1.0"?><opml version="2.0"></opml>', {
        status: 200,
        headers: {
          'Content-Type': 'application/xml',
          'X-Outline-Revision': '3',
          ETag: '"3"',
        },
      });
    });
    const got = await client().getOutline('abc');
    assert.match(got.opml, /<opml/);
    assert.equal(got.revision, 3);
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

  it('creates a share link for an outline', async () => {
    fetchMock.mock.mockImplementation(async () => {
      return new Response(
        JSON.stringify({ token: 'share-1', urlPath: '/outliner/?view=share-1' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    const result = await client().createShareLink('abc');
    assert.equal(result.token, 'share-1');
    assert.equal(result.urlPath, '/outliner/?view=share-1');
    const [url, init] = fetchMock.mock.calls[0].arguments;
    assert.equal(url, 'https://api.example.com/api/outlines/abc/share');
    assert.equal(init.method, 'POST');
  });

  it('loads a shared outline without auth', async () => {
    fetchMock.mock.mockImplementation(async (url, init) => {
      assert.equal(url, 'https://api.example.com/api/outlines/shared/share-1');
      assert.equal(init?.headers?.Authorization, undefined);
      return new Response('<opml></opml>', {
        status: 200,
        headers: {
          'Content-Type': 'application/xml',
          'X-Outline-Title': 'Shared',
        },
      });
    });
    const got = await client().getSharedOutline('share-1');
    assert.match(got.opml, /<opml/);
    assert.equal(got.title, 'Shared');
  });

  it('creates an editable share link for an outline', async () => {
    fetchMock.mock.mockImplementation(async () => {
      return new Response(
        JSON.stringify({ token: 'edit-1', urlPath: '/outliner/?edit=edit-1' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    const result = await client().createEditShareLink('abc');
    assert.equal(result.token, 'edit-1');
    assert.equal(result.urlPath, '/outliner/?edit=edit-1');
    const [url, init] = fetchMock.mock.calls[0].arguments;
    assert.equal(url, 'https://api.example.com/api/outlines/abc/share-edit');
    assert.equal(init.method, 'POST');
  });

  it('loads an editable outline without auth and returns id', async () => {
    fetchMock.mock.mockImplementation(async (url, init) => {
      assert.equal(url, 'https://api.example.com/api/outlines/edit/edit-1');
      assert.equal(init?.headers?.Authorization, undefined);
      return new Response('<opml></opml>', {
        status: 200,
        headers: {
          'Content-Type': 'application/xml',
          'X-Outline-Title': 'Editable',
          'X-Outline-Id': 'outline-9',
          'X-Outline-Revision': '4',
        },
      });
    });
    const got = await client().getEditableOutline('edit-1');
    assert.match(got.opml, /<opml/);
    assert.equal(got.title, 'Editable');
    assert.equal(got.id, 'outline-9');
    assert.equal(got.revision, 4);
  });

  it('saves and locks via edit token without bearer auth', async () => {
    fetchMock.mock.mockImplementation(async (url, init) => {
      assert.equal(init?.headers?.Authorization, undefined);
      if (String(url).endsWith('/lock') && init?.method === 'POST') {
        return new Response(JSON.stringify({ token: 'lease-e', leaseUntil: '2099' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (String(url).endsWith('/lock') && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({ id: 'outline-9', revision: 5 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const c = client();
    const lease = await c.acquireEditLock('edit-1');
    assert.equal(lease.token, 'lease-e');
    const saved = await c.saveEditableOutline('edit-1', {
      opml: '<opml></opml>',
      revision: 4,
      leaseToken: 'lease-e',
      title: 'T',
    });
    assert.equal(saved.revision, 5);
    await c.releaseEditLock('edit-1', 'lease-e');
    assert.equal(
      fetchMock.mock.calls[0].arguments[0],
      'https://api.example.com/api/outlines/edit/edit-1/lock',
    );
    assert.equal(fetchMock.mock.calls[1].arguments[1].method, 'PUT');
    assert.equal(fetchMock.mock.calls[1].arguments[1].headers['If-Match'], '4');
    assert.equal(fetchMock.mock.calls[1].arguments[1].headers['X-Lease-Token'], 'lease-e');
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
