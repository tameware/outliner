# Outliner host kit

Optional Flask routes that pair with the browser client’s Drive share links:

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/outliner/drive/share` | Mint opaque `?view=` / `?edit=` (Bearer access token required) |
| GET | `/api/outliner/drive/view/<token>` | Read-only OPML |
| GET/PUT | `/api/outliner/drive/edit/<token>` | Load / save editable share |
| GET/PUT | `/api/outliner/drive/<file_id>` | Legacy anyone-with-link by Drive file id |

The static Outliner app (this repo’s root) calls these same-origin paths. Without a host kit, local OPML Import/Export and signed-in Drive Open/Save still work; guest share links need this proxy (CORS/CSP) and a signing secret.

## Mount on your Flask app

```python
from outliner_host import register_outliner_host

register_outliner_host(app)
```

Put `host/` on `PYTHONPATH`, or copy `host/outliner_host/` next to your app package.

## Configuration

| Item | Where |
| --- | --- |
| `OUTLINER_SHARE_SECRET` | Env or `app.config['OUTLINER_SHARE_SECRET']` — required (no default); changing it invalidates existing share URLs |
| OAuth Web client ID | Browser `config.local.js` (`googleClientId`) |
| `driveWriterServiceAccount` | Browser config — SA email granted writer on opaque edit shares (`PUT …/edit/<token>`) |
| Google Drive API | Enabled on the GCP project; App Engine (or other) default credentials used for uploads |

## Dependencies

```bash
pip install -r host/requirements.txt
```

`requests` is required for `google.auth.transport.requests` (Drive uploads).

## Tests

```bash
cd host
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
PYTHONPATH=. .venv/bin/pytest tests -q
```
