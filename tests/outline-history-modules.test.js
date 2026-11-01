/**
 * Locks undo/history split out of the old clear-outline-ui monolith.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('outline history module', () => {
  it('lives in src/outliner/outline-history.js', async () => {
    await access(join(root, 'src/outliner/outline-history.js'));
  });

  it('exports createOutlineHistory from outline-history.js', async () => {
    const mod = await import('../src/outliner/outline-history.js');
    assert.equal(typeof mod.createOutlineHistory, 'function');
  });

  it('does not keep a clear-outline-ui.js shim', async () => {
    await assert.rejects(
      () => access(join(root, 'src/outliner/clear-outline-ui.js')),
      { code: 'ENOENT' },
    );
  });

  it('app.js imports createOutlineHistory from outline-history.js', () => {
    const appJs = readFileSync(join(root, 'src/app.js'), 'utf8');
    assert.match(appJs, /from ['"]\.\/outliner\/outline-history\.js['"]/);
    assert.doesNotMatch(appJs, /clear-outline-ui/);
  });
});
