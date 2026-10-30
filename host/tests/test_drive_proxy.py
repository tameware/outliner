"""Public Drive OPML proxy for share links (no browser CORS)."""

from __future__ import annotations

from pathlib import Path

import pytest

from outliner_host import create_app

SAMPLE_OPML = (
    '<?xml version="1.0"?>\n'
    '<opml version="2.0"><head><title>Shared</title></head>'
    '<body><outline text="A"/></body></opml>'
)

HOST_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def client():
    app = create_app()
    calls = []

    def fake_fetch(url: str) -> tuple[int, str]:
        calls.append(url)
        if 'bad-html' in url:
            return 200, '<!DOCTYPE html><html><body>virus scan</body></html>'
        if 'missing' in url:
            return 404, 'Not Found'
        if 'upstream-fail' in url:
            return 502, 'Bad Gateway'
        return 200, SAMPLE_OPML

    app.config['DRIVE_PUBLIC_FETCH'] = fake_fetch
    yield app.test_client(), calls


@pytest.fixture
def write_client():
    app = create_app()
    uploads = []

    def fake_upload(file_id: str, opml: str) -> tuple[int, str]:
        uploads.append({'file_id': file_id, 'opml': opml})
        if file_id == 'forbidden':
            return 403, 'Forbidden'
        if file_id == 'missing':
            return 404, 'Not Found'
        return 200, '{}'

    app.config['DRIVE_WRITE_UPLOAD'] = fake_upload
    yield app.test_client(), uploads, app


def test_proxies_public_opml(client):
    http, calls = client
    response = http.get('/api/outliner/drive/fileAbc_123-xyz')
    assert response.status_code == 200
    assert b'<opml' in response.data
    assert response.headers['Content-Type'].startswith('application/xml')
    assert len(calls) == 1
    assert 'export=download' in calls[0]
    assert 'fileAbc_123-xyz' in calls[0]
    assert calls[0].startswith('https://drive.google.com/uc?')


def test_forwards_last_modified_from_drive(client):
    http, _calls = client
    app = http.application

    def fake_fetch(url: str) -> tuple[int, str, dict[str, str]]:
        return 200, SAMPLE_OPML, {'Last-Modified': 'Thu, 29 Oct 2026 19:57:45 GMT'}

    app.config['DRIVE_PUBLIC_FETCH'] = fake_fetch
    response = http.get('/api/outliner/drive/fileAbc_123-xyz')
    assert response.status_code == 200
    assert response.headers.get('Last-Modified') == 'Thu, 29 Oct 2026 19:57:45 GMT'
    assert response.headers.get('X-Outliner-Modified') == 'Thu, 29 Oct 2026 19:57:45 GMT'


def test_rejects_invalid_file_id(client):
    http, calls = client
    response = http.get('/api/outliner/drive/not.valid!')
    assert response.status_code == 400
    assert calls == []


def test_rejects_html_interstitial(client):
    http, _calls = client
    response = http.get('/api/outliner/drive/bad-html')
    assert response.status_code == 502


def test_upstream_404(client):
    http, _calls = client
    response = http.get('/api/outliner/drive/missing')
    assert response.status_code == 404


def test_put_by_file_id_is_disabled(write_client):
    http, uploads, _app = write_client
    response = http.put(
        '/api/outliner/drive/fileEdit1',
        data=SAMPLE_OPML,
        content_type='application/xml',
    )
    assert response.status_code == 405
    assert uploads == []


def test_put_rejects_invalid_file_id(write_client):
    http, uploads, _app = write_client
    response = http.put(
        '/api/outliner/drive/not.valid!',
        data=SAMPLE_OPML,
        content_type='application/xml',
    )
    assert response.status_code in (400, 405)
    assert uploads == []


def test_host_requirements_include_requests():
    text = (HOST_ROOT / 'requirements.txt').read_text(encoding='utf-8')
    assert 'requests' in text
    assert 'Flask' in text
    assert 'google-auth' in text
