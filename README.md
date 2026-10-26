# Outliner

A browser-based WYSIWYG outliner built on nested HTML lists. Edit text in place, expand and collapse sections, add or remove lines, and promote or demote items. Save and restore outlines as [OPML](http://opml.org/) for interchange with other outliners.

## Features

- Classic outline numbering (A. / 1. / a. / i.)
- Expand / collapse parents (▸ / ▾)
- Inline editing (`contenteditable`)
- Add / remove lines (toolbar or keyboard)
- Indent / outdent (`Tab` / `Shift+Tab`); toolbar Promote lifts children up, Demote gathers following siblings
- OPML 2.0 save and open (including expansion state)
- Optional **Sign in with Google** + **Save / Open from cloud** (GCP App Engine API)
- Bridge deal lines (PBN / `[Deal "…"]`) render a compass diagram with suit symbols

**This repository** ([tameware/outliner](https://github.com/tameware/outliner)) is the canonical open-source project. It has **no** tie to any particular cloud account: the committed `config.js` is `null`, and GitHub Pages is a local-only demo.

**Production** (sign-in + save to GCP) lives in the separate [tameware](https://github.com/tameware) site repo (`src/tameware`), which vendors this app under `/outliner/` and keeps deployment config out of this project.

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
| `Enter` | New line below (sibling if leaf; first child if parent) |
| `Tab` | Demote (indent) |
| `Shift+Tab` | Promote (outdent) |
| `↑` / `↓` | Previous / next visible line |
| `⌥↑` / `⌥↓` (Option/Alt) | Previous / next same-level line |
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
| `deal-diagram.js` | PBN deal detection and compass diagrams |
| `styles.css` | Layout and outline numbering |
| `cloud.js` / `cloud-ui.js` | Optional cloud API client and UI |
| `auth-firebase.js` | Google sign-in via Firebase Auth |
| `config.js` | Committed cloud defaults (`null` = local-only) |
| `config.local.js` | Gitignored overrides (your Firebase + API base) |
| `config.example.js` | Template for `config.local.js` |
| `tests/` | Unit tests |

## Cloud save (optional)

Local OPML **Save file** / **Open file** always work. This OSS tree does not include a hosted backend.

Cloud controls appear only when config sets an `apiBase`. For a personal fork or a site that hosts the API:

```bash
cp config.example.js config.local.js
# edit config.local.js
```

`config.local.js` is gitignored. Do not commit real project credentials into this public repo.

The client expects:

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/outlines` | JSON `{ outlines: [{ id, title }] }` |
| `POST` | `/api/outlines` | Body: OPML; returns `{ id, revision }` |
| `GET` | `/api/outlines/:id` | Body: OPML |
| `PUT` | `/api/outlines/:id` | Body: OPML; `If-Match` revision; optional `X-Lease-Token` |
| `POST` | `/api/outlines/:id/lock` | Returns `{ token, leaseUntil }` |
| `DELETE` | `/api/outlines/:id/lock` | Header `X-Lease-Token` |

All requests send `Authorization: Bearer <Firebase ID token>`.

Deep links use `?id=<outlineId>` and load after sign-in.

With the default committed config, the cloud bar stays hidden (including on GitHub Pages).

## Embedding

Serve the app files, then:

```js
import { boot, toOpml, parseOpml, loadOutline } from './outliner.js';

const api = boot(); // mounts `[data-outline-root]`
```

See `index.html` for file and cloud wiring.

## License

[MIT](LICENSE)
