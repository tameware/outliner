"""Opaque Drive share tokens — view and edit are not interchangeable."""

from __future__ import annotations

import pytest
from itsdangerous import BadSignature

from outliner_host.share_tokens import (
    mint_share_token,
    parse_share_token,
    share_secret_from_env,
    share_url_path,
)


def test_view_and_edit_tokens_differ_and_are_mode_bound():
    secret = 'unit-test-secret'
    view = mint_share_token(secret, 'view', 'file-9')
    edit = mint_share_token(secret, 'edit', 'file-9')
    assert view != edit
    assert parse_share_token(secret, 'view', view) == 'file-9'
    assert parse_share_token(secret, 'edit', edit) == 'file-9'
    with pytest.raises(BadSignature):
        parse_share_token(secret, 'edit', view)
    with pytest.raises(BadSignature):
        parse_share_token(secret, 'view', edit)


def test_share_url_paths():
    assert share_url_path('view', 'tok') == '/outliner/?view=tok'
    assert share_url_path('edit', 'tok') == '/outliner/?edit=tok'


def test_share_secret_from_env_fails_closed(monkeypatch):
    monkeypatch.delenv('OUTLINER_SHARE_SECRET', raising=False)
    monkeypatch.delenv('OUTLINES_SHARE_SECRET', raising=False)
    with pytest.raises(RuntimeError, match='OUTLINER_SHARE_SECRET'):
        share_secret_from_env()


def test_mint_endpoint_and_token_routes():
    from outliner_host import create_app

    secret = 'unit-test-secret'
    app = create_app()
    app.config['OUTLINER_SHARE_SECRET'] = secret
    sample = '<?xml version="1.0"?><opml version="2.0"><body></body></opml>'

    def fake_fetch(url: str) -> tuple[int, str]:
        assert 'file-9' in url
        return 200, sample

    uploads = []

    def fake_upload(file_id: str, opml: str) -> tuple[int, str]:
        uploads.append({'file_id': file_id, 'opml': opml})
        return 200, '{}'

    def fake_verify(token: str) -> bool:
        return token == 'access-tok'

    def fake_can_access(token: str, file_id: str) -> bool:
        return token == 'access-tok' and file_id == 'file-9'

    app.config['DRIVE_PUBLIC_FETCH'] = fake_fetch
    app.config['DRIVE_WRITE_UPLOAD'] = fake_upload
    app.config['GOOGLE_ACCESS_TOKEN_VERIFY'] = fake_verify
    app.config['DRIVE_TOKEN_CAN_ACCESS_FILE'] = fake_can_access
    client = app.test_client()

    denied = client.post(
        '/api/outliner/drive/share',
        json={'fileId': 'file-9', 'mode': 'view'},
    )
    assert denied.status_code == 401

    bogus = client.post(
        '/api/outliner/drive/share',
        json={'fileId': 'file-9', 'mode': 'view'},
        headers={'Authorization': 'Bearer forged'},
    )
    assert bogus.status_code == 401

    minted = client.post(
        '/api/outliner/drive/share',
        json={'fileId': 'file-9', 'mode': 'view'},
        headers={'Authorization': 'Bearer access-tok'},
    )
    assert minted.status_code == 200
    view_token = minted.get_json()['token']
    assert minted.get_json()['urlPath'] == f'/outliner/?view={view_token}'
    assert 'file-9' not in minted.get_json()['urlPath']

    edit_minted = client.post(
        '/api/outliner/drive/share',
        json={'fileId': 'file-9', 'mode': 'edit'},
        headers={'Authorization': 'Bearer access-tok'},
    )
    edit_token = edit_minted.get_json()['token']
    assert view_token != edit_token

    got = client.get(f'/api/outliner/drive/view/{view_token}')
    assert got.status_code == 200
    assert b'<opml' in got.data
    assert got.headers.get('X-Outliner-File-Id') == 'file-9'

    assert client.get(f'/api/outliner/drive/edit/{view_token}').status_code == 404
    assert client.put(
        f'/api/outliner/drive/edit/{view_token}',
        data=sample,
        content_type='application/xml',
    ).status_code == 404

    put = client.put(
        f'/api/outliner/drive/edit/{edit_token}',
        data=sample,
        content_type='application/xml',
    )
    assert put.status_code == 204
    assert uploads[0]['file_id'] == 'file-9'
