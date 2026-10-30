/**
 * Only the line with the insertion point should look highlighted.
 * Hover must not leave a residual highlight on the previous line after ArrowDown.
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

describe('outline row highlight', () => {
  it('highlights the row that contains the caret via :focus-within', () => {
    const body = ruleBody(css, '.row:focus-within');
    assert.ok(body, 'expected .row:focus-within rule');
    assert.match(body, /background\s*:/);
    assert.doesNotMatch(body, /background\s*:\s*none\b/);
    assert.doesNotMatch(body, /background\s*:\s*transparent\b/);
  });

  it('does not highlight rows on :hover (avoids a leftover highlight under the pointer)', () => {
    const body = ruleBody(css, '.row:hover');
    if (!body) return;
    assert.doesNotMatch(
      body,
      /background\s*:\s*(?!none\b|transparent\b)[^;]+/,
      '.row:hover must not set a visible background highlight',
    );
  });
});
