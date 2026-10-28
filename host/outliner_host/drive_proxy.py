"""Proxy anyone-with-the-link Drive OPML for browser share links (no CORS)."""

from __future__ import annotations

import re
import urllib.error
import urllib.request
from typing import Callable

from flask import Blueprint, Response, current_app, jsonify, request
from itsdangerous import BadSignature

from .share_tokens import (
    mint_share_token,
    parse_share_token,
    share_secret_from_env,
    share_url_path,
)

DRIVE_FILE_ID_RE = re.compile(r'^[A-Za-z0-9_-]+$')
DRIVE_UC_DOWNLOAD = 'https://drive.google.com/uc?export=download&id={file_id}'
DRIVE_UPLOAD = (
    'https://www.googleapis.com/upload/drive/v3/files/{file_id}?uploadType=media'
)
DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

bp = Blueprint('outliner_drive_proxy', __name__)

FetchFn = Callable[[str], tuple[int, str]]
UploadFn = Callable[[str, str], tuple[int, str]]


def _share_secret() -> str:
    return current_app.config.get('OUTLINER_SHARE_SECRET') or share_secret_from_env()


def default_fetch(url: str) -> tuple[int, str]:
    req = urllib.request.Request(
        url,
        headers={'User-Agent': 'outliner-host/1.0'},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode('utf-8', errors='replace')
            return int(resp.status), body
    except urllib.error.HTTPError as err:
        body = err.read().decode('utf-8', errors='replace') if err.fp else ''
        return int(err.code), body
    except urllib.error.URLError as err:
        raise RuntimeError(f'Drive fetch failed: {err}') from err


def default_upload(file_id: str, opml: str) -> tuple[int, str]:
    """Upload OPML via ADC (e.g. App Engine default service account)."""
    from google.auth import default
    from google.auth.transport.requests import AuthorizedSession

    creds, _project = default(scopes=[DRIVE_SCOPE])
    session = AuthorizedSession(creds)
    url = DRIVE_UPLOAD.format(file_id=file_id)
    response = session.patch(
        url,
        data=opml.encode('utf-8'),
        headers={'Content-Type': 'application/xml'},
        timeout=30,
    )
    return int(response.status_code), response.text or ''


def is_opml_body(text: str) -> bool:
    trimmed = (text or '').lstrip()
    if not trimmed:
        return False
    lower = trimmed[:200].lower()
    if lower.startswith('<!doctype') or lower.startswith('<html'):
        return False
    return '<opml' in lower or trimmed.startswith('<?xml')


def fetch_public_opml(file_id: str, fetch: FetchFn | None = None) -> tuple[int, str | None]:
    """Return (status, opml_or_none)."""
    if not DRIVE_FILE_ID_RE.fullmatch(file_id):
        return 400, None
    url = DRIVE_UC_DOWNLOAD.format(file_id=file_id)
    fetch_fn = fetch or default_fetch
    status, body = fetch_fn(url)
    if status != 200:
        return (404 if status == 404 else 502), None
    if not is_opml_body(body):
        return 502, None
    return 200, body


def write_public_opml(
    file_id: str,
    opml: str,
    upload: UploadFn | None = None,
) -> tuple[int, str]:
    """Return (http_status, detail). Success is (204, '')."""
    if not DRIVE_FILE_ID_RE.fullmatch(file_id):
        return 400, 'Invalid file id'
    if not is_opml_body(opml):
        return 400, 'Body must be OPML'
    upload_fn = upload or default_upload
    status, body = upload_fn(file_id, opml)
    if status in (200, 204):
        return 204, ''
    if status in (403, 404):
        return 404, body or 'Outline update forbidden'
    detail = (body or '').strip() or f'Drive upload HTTP {status}'
    return 502, detail


def _opml_response(file_id: str, body: str) -> Response:
    response = Response(body, status=200, mimetype='application/xml')
    response.headers['X-Outliner-File-Id'] = file_id
    return response


@bp.post('/api/outliner/drive/share')
def mint_drive_share_link():
    """Mint an opaque view/edit token for a Drive file id (caller must be signed in)."""
    auth = request.headers.get('Authorization') or ''
    if not auth.lower().startswith('bearer ') or not auth[7:].strip():
        return jsonify({'error': 'Sign in required'}), 401
    data = request.get_json(silent=True) or {}
    file_id = str(data.get('fileId') or '').strip()
    mode = str(data.get('mode') or '').strip()
    if mode not in ('view', 'edit'):
        return jsonify({'error': 'mode must be view or edit'}), 400
    if not DRIVE_FILE_ID_RE.fullmatch(file_id):
        return jsonify({'error': 'Invalid file id'}), 400
    try:
        token = mint_share_token(_share_secret(), mode, file_id)
    except ValueError as err:
        return jsonify({'error': str(err)}), 400
    return jsonify(
        {
            'token': token,
            'urlPath': share_url_path(mode, token),
            'mode': mode,
        }
    )


@bp.get('/api/outliner/drive/view/<token>')
def get_view_share_outline(token: str):
    try:
        file_id = parse_share_token(_share_secret(), 'view', token)
    except BadSignature:
        return jsonify({'error': 'Invalid share link'}), 404
    fetch = current_app.config.get('DRIVE_PUBLIC_FETCH')
    try:
        status, body = fetch_public_opml(file_id, fetch=fetch)
    except RuntimeError as err:
        return jsonify({'error': str(err)}), 502
    if status != 200 or body is None:
        return jsonify({'error': 'Outline unavailable'}), status
    return _opml_response(file_id, body)


@bp.get('/api/outliner/drive/edit/<token>')
def get_edit_share_outline(token: str):
    try:
        file_id = parse_share_token(_share_secret(), 'edit', token)
    except BadSignature:
        return jsonify({'error': 'Invalid share link'}), 404
    fetch = current_app.config.get('DRIVE_PUBLIC_FETCH')
    try:
        status, body = fetch_public_opml(file_id, fetch=fetch)
    except RuntimeError as err:
        return jsonify({'error': str(err)}), 502
    if status != 200 or body is None:
        return jsonify({'error': 'Outline unavailable'}), status
    return _opml_response(file_id, body)


@bp.put('/api/outliner/drive/edit/<token>')
def put_edit_share_outline(token: str):
    try:
        file_id = parse_share_token(_share_secret(), 'edit', token)
    except BadSignature:
        return jsonify({'error': 'Invalid share link'}), 404
    opml = request.get_data(as_text=True) or ''
    upload = current_app.config.get('DRIVE_WRITE_UPLOAD')
    try:
        status, detail = write_public_opml(file_id, opml, upload=upload)
    except Exception as err:  # noqa: BLE001 — surface ADC/Drive failures as 502
        return jsonify({'error': str(err)}), 502
    if status == 204:
        response = Response(status=204)
        response.headers['X-Outliner-File-Id'] = file_id
        return response
    return jsonify({'error': detail or 'Outline update failed'}), status


@bp.get('/api/outliner/drive/<file_id>')
def get_public_drive_outline(file_id: str):
    """Legacy/public GET by Drive file id (anyone-with-link)."""
    fetch = current_app.config.get('DRIVE_PUBLIC_FETCH')
    try:
        status, body = fetch_public_opml(file_id, fetch=fetch)
    except RuntimeError as err:
        return jsonify({'error': str(err)}), 502
    if status != 200 or body is None:
        return jsonify({'error': 'Outline unavailable'}), status
    return _opml_response(file_id, body)


@bp.put('/api/outliner/drive/<file_id>')
def put_public_drive_outline(file_id: str):
    """Legacy PUT by file id — prefer /edit/<token> for share links."""
    opml = request.get_data(as_text=True) or ''
    upload = current_app.config.get('DRIVE_WRITE_UPLOAD')
    try:
        status, detail = write_public_opml(file_id, opml, upload=upload)
    except Exception as err:  # noqa: BLE001 — surface ADC/Drive failures as 502
        return jsonify({'error': str(err)}), 502
    if status == 204:
        return Response(status=204)
    return jsonify({'error': detail or 'Outline update failed'}), status
