/**
 * Locks startup wiring so document-session loading checks do not close over
 * the late-assigned `root` binding before boot.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('app.js startup loading check', () => {
  it('passes the early outline root (rootEl) to isOutlineLoading', () => {
    const appJs = readFileSync(join(root, 'src/app.js'), 'utf8');
    assert.match(
      appJs,
      /isLoading:\s*\(\)\s*=>\s*isOutlineLoading\(rootEl\)/,
      'isLoading must use rootEl; `root` is assigned only after boot()',
    );
    assert.doesNotMatch(appJs, /isOutlineLoading\(root\)/);
  });
});
