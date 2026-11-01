/**
 * Locks startup wiring so document-session callbacks do not close over
 * bindings that are only assigned after boot / later in the module.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('app.js startup session wiring', () => {
  it('passes the early outline root (rootEl) to isOutlineLoading', () => {
    const appJs = readFileSync(join(root, 'src/app.js'), 'utf8');
    assert.match(
      appJs,
      /isLoading:\s*\(\)\s*=>\s*isOutlineLoading\(rootEl\)/,
      'isLoading must use rootEl; `root` is assigned only after boot()',
    );
    assert.doesNotMatch(appJs, /isOutlineLoading\(root\)/);
  });

  it('creates the dirty tracker before document session', () => {
    const appJs = readFileSync(join(root, 'src/app.js'), 'utf8');
    const dirtyAt = appJs.indexOf('createDirtyTracker(');
    const sessionAt = appJs.indexOf('createDocumentSession(');
    assert.ok(dirtyAt >= 0, 'expected createDirtyTracker in app.js');
    assert.ok(sessionAt >= 0, 'expected createDocumentSession in app.js');
    assert.ok(
      dirtyAt < sessionAt,
      'dirty must exist before docSession isDirty() can run',
    );
    assert.match(appJs, /isDirty:\s*\(\)\s*=>\s*dirty\.isDirty\(\)/);
  });
});
