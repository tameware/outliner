# Outliner

A browser-based WYSIWYG outliner built on nested HTML lists. Edit text in place, expand and collapse sections, add or remove lines, and promote or demote items. Save and restore outlines as [OPML](http://opml.org/) for interchange with other outliners.

## Features

- Classic outline numbering (A. / 1. / a. / i.)
- Expand / collapse parents (▸ / ▾)
- Inline editing (`contenteditable`)
- Add / remove lines (toolbar or keyboard)
- Promote / demote (`Shift+Tab` / `Tab`)
- OPML 2.0 save and open (including expansion state)
- Optional **Sign in with Google** + **Save / Open from cloud** (GCP App Engine API)

Demo: [tameware.github.io/outliner](https://tameware.github.io/outliner/)

## Try it

```bash
npm start
```

Then open [http://127.0.0.1:8765/](http://127.0.0.1:8765/).

Or open `index.html` via any static file server. Modules need HTTP(S), not `file://`.

## Keyboard

| Key | Action |
| --- | --- |
| `Enter` | New sibling line |
| `Tab` | Demote (indent) |
| `Shift+Tab` | Promote (outdent) |
| `Backspace` on empty line | Delete line |
| Click ▸ / ▾ | Collapse / expand |

## Tests

```bash
npm install
npm test
```

Uses Node’s built-in test runner and [jsdom](https://github.com/jsdom/jsdom).

## Project layout

| File | Role |
| --- | --- |
| `index.html` | Demo page and toolbar |
| `outliner.js` | Outline behavior and OPML import/export |
| `styles.css` | Layout and outline numbering |
| `cloud.js` / `cloud-ui.js` | Optional cloud API client and UI |
| `auth-firebase.js` | Google sign-in via Firebase Auth |
| `config.js` | Committed cloud defaults (`null` = local-only) |
| `config.local.js` | Gitignored overrides (your Firebase + API base) |
| `config.example.js` | Template for `config.local.js` |
| `tests/` | Unit tests |

## Cloud save (optional)

Local OPML **Save file** / **Open file** always work. Cloud controls appear only when config sets an `apiBase`.

**Do not put secrets in committed `config.js`.** Use a gitignored local file instead:

```bash
cp config.example.js config.local.js
# edit config.local.js
```

`config.local.js` is listed in `.gitignore`, so a normal `git add -A` will not upload it. Prefer this over a private branch (easy to merge by mistake) or a second clone (easy to edit the wrong tree).

Then:

1. Enable **Google** sign-in in a [Firebase](https://firebase.google.com/) project; add your Pages / App Engine domains under Authorized domains.
2. Implement the API on App Engine (or compatible host). The client expects:

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/outlines` | JSON `{ outlines: [{ id, title }] }` |
| `POST` | `/api/outlines` | Body: OPML; returns `{ id, revision }` |
| `GET` | `/api/outlines/:id` | Body: OPML |
| `PUT` | `/api/outlines/:id` | Body: OPML; `If-Match` revision; optional `X-Lease-Token` |
| `POST` | `/api/outlines/:id/lock` | Returns `{ token, leaseUntil }` |
| `DELETE` | `/api/outlines/:id/lock` | Header `X-Lease-Token` |

All requests send `Authorization: Bearer <Firebase ID token>`. Allow CORS from your Pages origin if the UI is not same-site.

Deep links use `?id=<outlineId>` and load after sign-in.

Until you add `config.local.js` (or change committed `config.js`), the cloud bar stays hidden. GitHub Pages keeps using the committed `null` config.

## Embedding

Serve the app files, then:

```js
import { boot, toOpml, parseOpml, loadOutline } from './outliner.js';

const api = boot(); // mounts `[data-outline-root]`
```

See `index.html` for file and cloud wiring.

## License

[MIT](LICENSE)
