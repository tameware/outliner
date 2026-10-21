# Outliner

A browser-based WYSIWYG outliner built on nested HTML lists. Edit text in place, expand and collapse sections, add or remove lines, and promote or demote items. Save and restore outlines as [OPML](http://opml.org/) for interchange with other outliners.

## Features

- Classic outline numbering (A. / 1. / a. / i.)
- Expand / collapse parents (▸ / ▾)
- Inline editing (`contenteditable`)
- Add / remove lines (toolbar or keyboard)
- Promote / demote (`Shift+Tab` / `Tab`)
- OPML 2.0 save and open (including expansion state)

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
| `tests/` | Unit tests |

## Embedding

Serve the three app files, then:

```js
import { boot, toOpml, parseOpml, loadOutline } from './outliner.js';

const api = boot(); // mounts `[data-outline-root]`
```

See `index.html` for Save / Open wiring.

## License

[MIT](LICENSE)
