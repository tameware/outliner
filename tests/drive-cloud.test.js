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

  it('loads a publicly shared outline without an access token via same-origin proxy', async () => {
    tokens[0] = null;
    const urls = [];
    fetchMock.mock.mockImplementation(async (url) => {
      urls.push(String(url));
      assert.equal(String(url), '/api/outliner/drive/file-public');
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

  it('uses a custom publicOutlineBase for anonymous downloads', async () => {
    tokens[0] = null;
    const urls = [];
    fetchMock.mock.mockImplementation(async (url) => {
      urls.push(String(url));
      return new Response(
        '<?xml version="1.0"?><opml version="2.0"><body></body></opml>',
        { status: 200, headers: { 'Content-Type': 'application/xml' } },
      );
    });
    const custom = createDriveCloudClient({
      getAccessToken: async () => null,
      fetch: fetchMock,
      publicOutlineBase: 'https://example.test/proxy/',
    });
    await custom.getOutline('abc123');
    assert.deepEqual(urls, ['https://example.test/proxy/abc123']);
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

  it('trashes an outline via files.update', async () => {
    const calls = [];
    fetchMock.mock.mockImplementation(async (url, init) => {
      calls.push({ url: String(url), method: init?.method || 'GET', body: init?.body });
      return new Response(JSON.stringify({ id: 'file-9', trashed: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    await client().deleteOutline('file-9');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/files\/file-9/);
    assert.equal(calls[0].method, 'PATCH');
    assert.deepEqual(JSON.parse(calls[0].body), { trashed: true });
  });

  it('creates distinct opaque view/edit share links via the mint API', async () => {
    fetchMock.mock.mockImplementation(async (url, init) => {
      const href = String(url);
      if (href.includes('/permissions') && init?.method === 'POST') {
        const body = JSON.parse(init.body);
        assert.equal(body.type, 'anyone');
        return new Response(JSON.stringify({ id: 'perm' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (href.endsWith('/share') && init?.method === 'POST') {
        const body = JSON.parse(init.body);
        assert.equal(body.fileId, 'file-9');
        assert.match(init.headers.Authorization, /Bearer access-1/);
        if (body.mode === 'view') {
          return new Response(
            JSON.stringify({
              token: 'view-opaque',
              urlPath: '/outliner/?view=view-opaque',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            token: 'edit-opaque',
            urlPath: '/outliner/?edit=edit-opaque',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200 });
    });
    const view = await client().createShareLink('file-9');
    const edit = await client().createEditShareLink('file-9');
    assert.equal(view.urlPath, '/outliner/?view=view-opaque');
    assert.equal(edit.urlPath, '/outliner/?edit=edit-opaque');
    assert.notEqual(view.token, edit.token);
    assert.doesNotMatch(view.urlPath, /file-9/);
    assert.doesNotMatch(edit.urlPath, /file-9/);
    assert.doesNotMatch(edit.urlPath, /view=/);
    const roles = fetchMock.mock.calls
      .filter((c) => String(c.arguments[0]).includes('/permissions'))
      .map((c) => JSON.parse(c.arguments[1].body).role);
    assert.deepEqual(roles, ['reader', 'writer']);
  });

  it('grants the writer service account on editable share links', async () => {
    const bodies = [];
    fetchMock.mock.mockImplementation(async (url, init) => {
      if (String(url).includes('/permissions') && init?.method === 'POST') {
        bodies.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ id: 'perm' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (String(url).endsWith('/share') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({ token: 'edit-opaque', urlPath: '/outliner/?edit=edit-opaque' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200 });
    });
    const withSa = createDriveCloudClient({
      getAccessToken: async () => tokens[0],
      fetch: fetchMock,
      driveWriterServiceAccount: 'sa@appspot.gserviceaccount.com',
    });
    await withSa.createEditShareLink('file-9');
    assert.deepEqual(bodies, [
      { type: 'anyone', role: 'writer', allowFileDiscovery: false },
      {
        type: 'user',
        role: 'writer',
        emailAddress: 'sa@appspot.gserviceaccount.com',
        sendNotificationEmail: false,
      },
    ]);
  });

  it('saves via opaque edit-token PUT when using shareAccess', async () => {
    tokens[0] = null;
    const calls = [];
    fetchMock.mock.mockImplementation(async (url, init) => {
      calls.push({ url: String(url), method: init?.method || 'GET', body: init?.body });
      return new Response('', {
        status: 200,
        headers: { 'X-Outliner-File-Id': 'file-9' },
      });
    });
    const guest = createDriveCloudClient({
      getAccessToken: async () => null,
      fetch: fetchMock,
      shareAccess: { mode: 'edit', token: 'edit-opaque' },
    });
    const saved = await guest.saveOutline('ignored', {
      opml: '<?xml version="1.0"?><opml></opml>',
      revision: null,
    });
    assert.equal(saved.id, 'file-9');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'PUT');
    assert.equal(calls[0].url, '/api/outliner/drive/edit/edit-opaque');
    assert.match(String(calls[0].body), /<opml/);
  });

  it('falls back to public PUT when authed save is forbidden', async () => {
    const calls = [];
    fetchMock.mock.mockImplementation(async (url, init) => {
      const href = String(url);
      const method = init?.method || 'GET';
      calls.push({ url: href, method });
      if (href.includes('/upload/') || href.includes('/drive/v3/files/file-9')) {
        return new Response(JSON.stringify({ error: { message: 'forbidden' } }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (method === 'PUT' && href.includes('/api/outliner/drive/')) {
        return new Response('', { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    const saved = await client().saveOutline('file-9', {
      opml: '<?xml version="1.0"?><opml></opml>',
      revision: null,
      title: 'Demo',
    });
    assert.equal(saved.id, 'file-9');
    assert.ok(calls.some((c) => c.method === 'PUT' && c.url.includes('/api/outliner/drive/')));
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
