"""Proxy anyone-with-the-link Drive OPML for browser share links (no CORS)."""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
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
TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo'
DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files/{file_id}'

bp = Blueprint('outliner_drive_proxy', __name__)

# Fetch may return (status, body) or (status, body, headers).
FetchResult = tuple[int, str] | tuple[int, str, dict[str, str]]
FetchFn = Callable[[str], FetchResult]
UploadFn = Callable[[str, str], tuple[int, str]]
TokenVerifyFn = Callable[[str], bool]
TokenCanAccessFn = Callable[[str, str], bool]


def _share_secret() -> str:
    configured = current_app.config.get('OUTLINER_SHARE_SECRET')
    if configured:
        return str(configured)
    return share_secret_from_env()


def default_verify_access_token(token: str) -> bool:
    """Return True when Google tokeninfo accepts the access token."""
    url = f'{TOKENINFO_URL}?access_token={urllib.parse.quote(token)}'
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            payload = json.loads(resp.read().decode('utf-8', errors='replace'))
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError, TimeoutError):
        return False
    return bool(payload.get('aud') or payload.get('azp') or payload.get('expires_in'))


def default_token_can_access_file(token: str, file_id: str) -> bool:
    """Return True when the user token can metadata-read the Drive file."""
    url = DRIVE_FILES_URL.format(file_id=urllib.parse.quote(file_id))
    req = urllib.request.Request(
        f'{url}?fields=id',
        headers={'Authorization': f'Bearer {token}', 'User-Agent': 'outliner-host/1.0'},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return int(resp.status) == 200
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
        return False


def _bearer_token() -> str | None:
    auth = request.headers.get('Authorization') or ''
    if not auth.lower().startswith('bearer '):
        return None
    token = auth[7:].strip()
    return token or None


def _require_verified_bearer() -> tuple[str | None, tuple[Response, int] | None]:
    token = _bearer_token()
    if not token:
        return None, (jsonify({'error': 'Sign in required'}), 401)
    verify: TokenVerifyFn = (
        current_app.config.get('GOOGLE_ACCESS_TOKEN_VERIFY') or default_verify_access_token
    )
    if not verify(token):
        return None, (jsonify({'error': 'Invalid or expired Google token'}), 401)
    return token, None


def _unpack_fetch(result: FetchResult) -> tuple[int, str, dict[str, str]]:
    if len(result) == 3:
        status, body, headers = result  # type: ignore[misc]
        return int(status), body, dict(headers or {})
    status, body = result  # type: ignore[misc]
    return int(status), body, {}


def default_fetch(url: str) -> tuple[int, str, dict[str, str]]:
    req = urllib.request.Request(
        url,
        headers={'User-Agent': 'outliner-host/1.0'},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode('utf-8', errors='replace')
            headers = {k: v for k, v in resp.headers.items()}
            return int(resp.status), body, headers
    except urllib.error.HTTPError as err:
        body = err.read().decode('utf-8', errors='replace') if err.fp else ''
        headers = {k: v for k, v in (err.headers.items() if err.headers else [])}
        return int(err.code), body, headers
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


def fetch_public_opml(
    file_id: str,
    fetch: FetchFn | None = None,
) -> tuple[int, str | None, dict[str, str]]:
    """Return (status, opml_or_none, upstream_headers)."""
    if not DRIVE_FILE_ID_RE.fullmatch(file_id):
        return 400, None, {}
    url = DRIVE_UC_DOWNLOAD.format(file_id=file_id)
    fetch_fn = fetch or default_fetch
    status, body, headers = _unpack_fetch(fetch_fn(url))
    if status != 200:
        return (404 if status == 404 else 502), None, headers
    if not is_opml_body(body):
        return 502, None, headers
    return 200, body, headers


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


def _modified_header(headers: dict[str, str] | None) -> str | None:
    if not headers:
        return None
    for key, value in headers.items():
        if key.lower() == 'last-modified' and value:
            return value
        if key.lower() == 'x-outliner-modified' and value:
            return value
    return None


def _opml_response(
    file_id: str,
    body: str,
    upstream_headers: dict[str, str] | None = None,
) -> Response:
    response = Response(body, status=200, mimetype='application/xml')
    response.headers['X-Outliner-File-Id'] = file_id
    modified = _modified_header(upstream_headers)
    if modified:
        response.headers['Last-Modified'] = modified
        response.headers['X-Outliner-Modified'] = modified
    return response


@bp.post('/api/outliner/drive/share')
def mint_drive_share_link():
    """Mint an opaque view/edit token for a Drive file id (caller must be signed in)."""
    access_token, err = _require_verified_bearer()
    if err is not None:
        return err
    data = request.get_json(silent=True) or {}
    file_id = str(data.get('fileId') or '').strip()
    mode = str(data.get('mode') or '').strip()
    if mode not in ('view', 'edit'):
        return jsonify({'error': 'mode must be view or edit'}), 400
    if not DRIVE_FILE_ID_RE.fullmatch(file_id):
        return jsonify({'error': 'Invalid file id'}), 400
    can_access: TokenCanAccessFn = (
        current_app.config.get('DRIVE_TOKEN_CAN_ACCESS_FILE') or default_token_can_access_file
    )
    assert access_token is not None
    if not can_access(access_token, file_id):
        return jsonify({'error': 'No access to that Drive file'}), 403
    try:
        secret = _share_secret()
        token = mint_share_token(secret, mode, file_id)
    except RuntimeError as err:
        return jsonify({'error': str(err)}), 503
    except ValueError as err:
        return jsonify({'error': str(err)}), 400
    return jsonify(
        {
            'token': token,
            'urlPath': share_url_path(mode, token),
            'mode': mode,
        }
    )


def _parse_share_file_id(mode: str, token: str) -> tuple[str | None, tuple[Response, int] | None]:
    try:
        file_id = parse_share_token(_share_secret(), mode, token)
    except RuntimeError as err:
        return None, (jsonify({'error': str(err)}), 503)
    except BadSignature:
        return None, (jsonify({'error': 'Invalid share link'}), 404)
    return file_id, None


@bp.get('/api/outliner/drive/view/<token>')
def get_view_share_outline(token: str):
    file_id, err = _parse_share_file_id('view', token)
    if err is not None:
        return err
    assert file_id is not None
    fetch = current_app.config.get('DRIVE_PUBLIC_FETCH')
    try:
        status, body, headers = fetch_public_opml(file_id, fetch=fetch)
    except RuntimeError as err:
        return jsonify({'error': str(err)}), 502
    if status != 200 or body is None:
        return jsonify({'error': 'Outline unavailable'}), status
    return _opml_response(file_id, body, headers)


@bp.get('/api/outliner/drive/edit/<token>')
def get_edit_share_outline(token: str):
    file_id, err = _parse_share_file_id('edit', token)
    if err is not None:
        return err
    assert file_id is not None
    fetch = current_app.config.get('DRIVE_PUBLIC_FETCH')
    try:
        status, body, headers = fetch_public_opml(file_id, fetch=fetch)
    except RuntimeError as err:
        return jsonify({'error': str(err)}), 502
    if status != 200 or body is None:
        return jsonify({'error': 'Outline unavailable'}), status
    return _opml_response(file_id, body, headers)


@bp.put('/api/outliner/drive/edit/<token>')
def put_edit_share_outline(token: str):
    file_id, err = _parse_share_file_id('edit', token)
    if err is not None:
        return err
    assert file_id is not None
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
        status, body, headers = fetch_public_opml(file_id, fetch=fetch)
    except RuntimeError as err:
        return jsonify({'error': str(err)}), 502
    if status != 200 or body is None:
        return jsonify({'error': 'Outline unavailable'}), status
    return _opml_response(file_id, body, headers)


@bp.put('/api/outliner/drive/<file_id>')
def put_public_drive_outline(file_id: str):
    """Disabled: unauthenticated PUT by file id used the host SA.

    Writable shares must use ``PUT /api/outliner/drive/edit/<token>``.
    """
    return jsonify(
        {
            'error': 'Use an editable share link to save',
            'fileId': file_id,
        }
    ), 405
