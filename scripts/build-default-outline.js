/**
 * Copy Getting Started.opml into src/outliner/default-outline.js for the app.
 * Generated output is gitignored; run via `npm run build` (also pretest / prestart).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const opmlPath = join(root, 'Getting Started.opml');
const outPath = join(root, 'src/outliner/default-outline.js');

const opml = readFileSync(opmlPath, 'utf8').replace(/\r\n/g, '\n');
const escaped = JSON.stringify(opml);
const banner =
  '/** Generated from Getting Started.opml by scripts/build-default-outline.js — do not edit. */\n';
const source = `${banner}export const DEFAULT_OUTLINE_OPML = ${escaped};\n`;

writeFileSync(outPath, source);
console.log(`Wrote ${outPath} (${opml.length} bytes of OPML)`);
