/**
 * Print should show the outline alone — no app chrome around it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'styles.css'), 'utf8');

/** @param {string} source */
function printBlock(source) {
  const start = source.search(/@media\s+print\s*\{/);
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return '';
}

describe('print styles', () => {
  it('defines an @media print stylesheet', () => {
    assert.match(css, /@media\s+print\s*\{/);
  });

  it('hides page chrome when printing', () => {
    const block = printBlock(css);
    assert.ok(block, 'expected @media print { ... }');
    assert.match(block, /\.chrome\s*\{[^}]*display\s*:\s*none/);
    assert.match(block, /\.chrome-sticky\s*\{[^}]*display\s*:\s*none/);
  });

  it('keeps the outline root printable (not display:none)', () => {
    const block = printBlock(css);
    assert.doesNotMatch(
      block,
      /\[data-outline-root\]\s*\{[^}]*display\s*:\s*none/,
    );
    assert.doesNotMatch(block, /main\s*\{[^}]*display\s*:\s*none/);
  });
});

