"""Opaque view/edit share tokens for Drive outlines.

View and edit tokens use different salts so one cannot be turned into the other.
"""

from __future__ import annotations

import os

from itsdangerous import BadSignature, URLSafeSerializer

DEFAULT_SHARE_SECRET = 'dev-outliner-share-secret-change-me'


def share_secret_from_env() -> str:
    return (
        os.environ.get('OUTLINER_SHARE_SECRET')
        or os.environ.get('OUTLINES_SHARE_SECRET')
        or DEFAULT_SHARE_SECRET
    )


def _serializer(secret: str, mode: str) -> URLSafeSerializer:
    if mode not in ('view', 'edit'):
        raise ValueError(f'invalid share mode: {mode}')
    return URLSafeSerializer(secret, salt=f'outliner-drive-{mode}')


def mint_share_token(secret: str, mode: str, file_id: str) -> str:
    file_id = str(file_id or '').strip()
    if not file_id:
        raise ValueError('file_id required')
    return _serializer(secret, mode).dumps({'f': file_id})


def parse_share_token(secret: str, mode: str, token: str) -> str:
    token = str(token or '').strip()
    if not token:
        raise BadSignature('missing token')
    data = _serializer(secret, mode).loads(token)
    if not isinstance(data, dict):
        raise BadSignature('invalid payload')
    file_id = data.get('f')
    if not isinstance(file_id, str) or not file_id.strip():
        raise BadSignature('missing file id')
    return file_id.strip()


def share_url_path(mode: str, token: str, prefix: str = '/outliner/') -> str:
    base = prefix if prefix.endswith('/') else f'{prefix}/'
    if mode == 'view':
        return f'{base}?view={token}'
    if mode == 'edit':
        return f'{base}?edit={token}'
    raise ValueError(f'invalid share mode: {mode}')
