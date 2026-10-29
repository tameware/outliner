/**
 * Outline markers (A. 1. a.) must sit outside the contenteditable caret flow.
 * An inline ::before inside .text puts the caret left of the label on empty lines.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'styles.css'), 'utf8');

/** Match a rule whose selector is exactly `selector` (not a longer compound). */
function ruleBody(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^}]*)\\}`);
  const match = source.match(re);
  return match ? match[1] : '';
}

describe('outline label styles', () => {
  it('keeps .text::before out of the caret’s inline flow', () => {
    const before = ruleBody(css, '.text::before');
    assert.ok(before, 'expected .text::before rule');
    assert.match(before, /position\s*:\s*absolute/);
    assert.doesNotMatch(before, /display\s*:\s*inline-block/);
  });

  it('reserves space for the absolutely positioned label inside .text', () => {
    const text = ruleBody(css, '.text');
    assert.match(text, /position\s*:\s*relative/);
    assert.match(text, /padding-left\s*:/);
  });
});
