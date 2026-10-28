# Outliner

A browser-based WYSIWYG outliner built on nested HTML lists. Edit text in place, expand and collapse sections, add or remove lines, and promote or demote items. Save and restore outlines as [OPML](http://opml.org/) for interchange with other outliners.

## Features

- Classic outline numbering (A. / 1. / a. / i.)
- Expand / collapse parents (▸ / ▾)
- Inline editing (`contenteditable`)
- Add / remove lines (toolbar or keyboard)
- Indent / outdent (`Tab` / `Shift+Tab`); toolbar Promote lifts children up, Demote gathers following siblings
- OPML 2.0 save and open (including expansion state)
- Optional **Sign in with Google** + **Save / Open on Google Drive** (files in a **Tameware Outliner** folder)
- Bridge deal lines (PBN / `[Deal "…"]`) render a compass diagram with suit symbols

**This repository** ([tameware/outliner](https://github.com/tameware/outliner)) is the canonical open-source project. It has **no** tie to any particular cloud account: the committed `config.js` is `null`, and GitHub Pages is a local-only demo.

**Production** (OAuth client id for the live origin) can be supplied by the host site (e.g. [tameware](https://github.com/tameware) under `/outliner/`) via gitignored `config.local.js`.

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
| `Backspace` at start of line | Merge with the line above (empty line removes it) |
| Click ▸ / ▾ | Collapse / expand |

## Tests

```bash
npm install
npm test
```

Uses Node’s built-in test runner and [jsdom](https://github.com/jsdom/jsdom).

## Change Log / version bumps

Enable repo hooks once per clone:

```bash
make hooks
```

Each normal commit then:

1. Bumps the display version after the decimal (`1.0` → `1.1`) and `package.json` (`1.0.0` → `1.1.0`)
2. Sets `OUTLINER_UPDATED` to today’s date
3. Prepends the commit subject to `changelog.html`

Skip once with `SKIP_OUTLINER_CHANGELOG=1`. Amends, merges, and squashes do not bump.

## Project layout

| File | Role |
| --- | --- |
| `index.html` | Demo page and toolbar |
| `privacy.html` | Privacy policy (also for Google OAuth consent) |
| `changelog.html` | Version history (Outliner → Change Log); auto-updated on commit |
| `scripts/changelog-release.js` | Bumps `major.minor` and prepends a Change Log entry |
| `.githooks/` | `prepare-commit-msg` runs the release script (`make hooks`) |
| `logo.png` | App icon (120×120); upload in Google Auth Platform branding |
| `outliner.js` | Outline behavior and OPML import/export |
| `deal-diagram.js` | PBN deal detection and compass diagrams |
| `styles.css` | Layout and outline numbering |
| `cloud.js` / `cloud-ui.js` | Config helpers, deep links, and cloud UI |
| `deep-link-load.js` | Eager `?id=` outline load (+ auth retry) |
| `drive-cloud.js` | Google Drive outline storage client |
| `auth-google.js` | Google Identity Services sign-in (Drive scope) |
| `config.js` | Committed cloud defaults (`null` = local-only) |
| `config.local.js` | Gitignored overrides (`googleClientId`) |
| `config.example.js` | Template for `config.local.js` |
| `tests/` | Unit tests |

## Cloud save (optional)

Local OPML **Import** / **Export** always work. Optional Drive save needs a Google Cloud OAuth **Web client ID** with the Drive API enabled and your page origin under Authorized JavaScript origins.

Cloud controls appear only when config sets `googleClientId`:

```bash
cp config.example.js config.local.js
# set googleClientId
```

`config.local.js` is gitignored. Do not commit real OAuth client secrets into this public repo (the GIS token client only needs the public client id).

Scope: `https://www.googleapis.com/auth/drive.file`. Outlines are stored as `.opml` files under a Drive folder named **Tameware Outliner** (created on first save).

Share links use Drive “anyone with the link” permissions plus **opaque** outliner tokens (minted by the host). View and edit tokens use different secrets/salts, so one cannot be turned into the other:

| Link | Meaning |
| --- | --- |
| `?view=<token>` | Read-only in the app |
| `?edit=<token>` | Editable guest — saves update the **same** Drive file (via host write proxy) |
| `?id=<fileId>` | Owner bookmark after Open/Save (signed-in); not a guest share link |

Editable shares grant “anyone with the link can edit” plus an optional `driveWriterServiceAccount` so the host can PUT updates without widening OAuth beyond `drive.file`.

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
