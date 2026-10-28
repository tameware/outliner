import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_FOLDER_NAME,
  createDriveCloudClient,
  CloudApiError,
} from '../drive-cloud.js';

describe('Drive cloud client', () => {
  let fetchMock;
  let tokens;

  beforeEach(() => {
    tokens = ['access-1'];
    fetchMock = mock.fn(async () => new Response('{}', { status: 200 }));
  });

  function client() {
    return createDriveCloudClient({
      getAccessToken: async () => tokens[0],
      fetch: fetchMock,
    });
  }

  it('creates the Tameware Outliner folder when missing then lists outlines', async () => {
    const calls = [];
    fetchMock.mock.mockImplementation(async (url, init) => {
      const href = String(url);
      calls.push({ url: href, method: init?.method || 'GET', body: init?.body });
      if (init?.method === 'POST' && !href.includes('upload')) {
        return new Response(JSON.stringify({ id: 'folder-1', name: APP_FOLDER_NAME }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (href.includes('google-apps.folder')) {
        return new Response(JSON.stringify({ files: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (href.includes('folder-1')) {
        return new Response(
          JSON.stringify({
            files: [{ id: 'f1', name: 'Bridge.opml' }, { id: 'f2', name: 'Notes.opml' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ files: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const list = await client().listOutlines();
    assert.deepEqual(list, [
      { id: 'f1', title: 'Bridge' },
      { id: 'f2', title: 'Notes' },
    ]);
    assert.ok(calls.some((c) => c.method === 'POST'));
    assert.match(JSON.stringify(calls), /Tameware Outliner/);
  });

  it('reuses an existing app folder', async () => {
    fetchMock.mock.mockImplementation(async (url, init) => {
      const href = String(url);
      if (init?.method === 'POST') {
        assert.fail('should not create folder');
      }
      if (href.includes('google-apps.folder')) {
        return new Response(
          JSON.stringify({ files: [{ id: 'folder-existing', name: APP_FOLDER_NAME }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ files: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    assert.deepEqual(await client().listOutlines(), []);
  });

  it('creates an OPML file in the app folder', async () => {
    fetchMock.mock.mockImplementation(async (url, init) => {
      if (String(url).includes('vnd.google-apps.folder')) {
        return new Response(
          JSON.stringify({ files: [{ id: 'folder-1', name: APP_FOLDER_NAME }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (String(url).includes('/upload/') && init?.method === 'POST') {
        assert.match(String(init.body), /folder-1/);
        assert.match(String(init.body), /<opml/);
        assert.equal(init.headers.Authorization, 'Bearer access-1');
        // Drive v3 has no File.etag field — revision comes from the ETag header.
        assert.match(String(url), /fields=id(?:&|$)/);
        assert.doesNotMatch(String(url), /etag/);
        return new Response(JSON.stringify({ id: 'file-9' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ETag: '"etag-1"' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const created = await client().createOutline({
      title: 'Demo',
      opml: '<?xml version="1.0"?><opml></opml>',
    });
    assert.equal(created.id, 'file-9');
    assert.equal(created.revision, '"etag-1"');
  });

  it('loads outline OPML and etag', async () => {
    fetchMock.mock.mockImplementation(async (url) => {
      if (String(url).includes('alt=media')) {
        return new Response('<opml></opml>', {
          status: 200,
          headers: { 'Content-Type': 'application/xml', ETag: '"e2"' },
        });
      }
      assert.match(String(url), /fields=name(?:&|$)/);
      assert.doesNotMatch(String(url), /etag/);
      return new Response(JSON.stringify({ name: 'Demo.opml' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: '"e2"' },
      });
    });
    const got = await client().getOutline('file-9');
    assert.match(got.opml, /<opml/);
    assert.equal(got.revision, '"e2"');
    assert.equal(got.title, 'Demo');
  });

  it('loads a publicly shared outline without an access token', async () => {
    tokens[0] = null;
    const urls = [];
    fetchMock.mock.mockImplementation(async (url) => {
      urls.push(String(url));
      assert.equal(
        String(url),
        'https://drive.google.com/uc?export=download&id=file-public',
      );
      return new Response(
        '<?xml version="1.0"?><opml version="2.0"><body></body></opml>',
        { status: 200, headers: { 'Content-Type': 'application/xml' } },
      );
    });
    const got = await client().getOutline('file-public');
    assert.match(got.opml, /<opml/);
    assert.equal(got.revision, null);
    assert.equal(urls.length, 1);
  });

  it('creates and saves with null revision when Drive omits ETag', async () => {
    fetchMock.mock.mockImplementation(async (url, init) => {
      if (String(url).includes('vnd.google-apps.folder')) {
        return new Response(
          JSON.stringify({ files: [{ id: 'folder-1', name: APP_FOLDER_NAME }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (String(url).includes('/upload/') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'file-9' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (String(url).includes('/upload/') && init?.method === 'PATCH') {
        assert.equal(init.headers['If-Match'], undefined);
        return new Response(JSON.stringify({ id: 'file-9' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200 });
    });
    const created = await client().createOutline({
      title: 'Demo',
      opml: '<?xml version="1.0"?><opml></opml>',
    });
    assert.equal(created.id, 'file-9');
    assert.equal(created.revision, null);
    const saved = await client().saveOutline('file-9', {
      opml: '<opml></opml>',
      revision: null,
    });
    assert.equal(saved.revision, null);
  });

  it('saves with If-Match etag', async () => {
    fetchMock.mock.mockImplementation(async (url, init) => {
      if (String(url).includes('/upload/') && init?.method === 'PATCH') {
        assert.equal(init.headers['If-Match'], '"e2"');
        assert.match(String(url), /fields=id(?:&|$)/);
        assert.doesNotMatch(String(url), /etag/);
        return new Response(JSON.stringify({ id: 'file-9' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ETag: '"e3"' },
        });
      }
      return new Response('{}', { status: 200 });
    });
    const saved = await client().saveOutline('file-9', {
      opml: '<opml></opml>',
      revision: '"e2"',
      title: 'Demo',
    });
    assert.equal(saved.revision, '"e3"');
  });

  it('creates read-only and editable share urlPaths', async () => {
    fetchMock.mock.mockImplementation(async (url, init) => {
      if (String(url).includes('/permissions') && init?.method === 'POST') {
        const body = JSON.parse(init.body);
        assert.equal(body.type, 'anyone');
        return new Response(JSON.stringify({ id: 'perm' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200 });
    });
    const view = await client().createShareLink('file-9');
    assert.equal(view.urlPath, '/outliner/?id=file-9&view=1');
    const edit = await client().createEditShareLink('file-9');
    assert.equal(edit.urlPath, '/outliner/?id=file-9');
    const roles = fetchMock.mock.calls
      .filter((c) => String(c.arguments[0]).includes('/permissions'))
      .map((c) => JSON.parse(c.arguments[1].body).role);
    assert.deepEqual(roles, ['reader', 'writer']);
  });

  it('throws CloudApiError on non-OK responses', async () => {
    fetchMock.mock.mockImplementation(async () => {
      return new Response(JSON.stringify({ error: { message: 'forbidden' } }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    await assert.rejects(() => client().getOutline('x'), (err) => {
      assert.ok(err instanceof CloudApiError);
      assert.equal(err.status, 403);
      return true;
    });
  });
});
