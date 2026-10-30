/**
 * Local changelog.html and the commit hooks that maintained it are gone;
 * Change log opens the GitHub commit history instead.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { OUTLINER_CHANGELOG_URL } from '../outliner-menu.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('changelog removed', () => {
  it('points Change log at the GitHub main commit history', () => {
    assert.equal(
      OUTLINER_CHANGELOG_URL,
      'https://github.com/tameware/outliner/commits/main/',
    );
  });

  it('does not ship a local changelog page or release automation', () => {
    assert.equal(existsSync(join(repoRoot, 'changelog.html')), false);
    assert.equal(existsSync(join(repoRoot, 'scripts/changelog-release.js')), false);
    assert.equal(existsSync(join(repoRoot, '.githooks')), false);
    assert.equal(existsSync(join(repoRoot, 'tests/changelog-release.test.js')), false);
    assert.equal(existsSync(join(repoRoot, 'tests/githooks-changelog.test.js')), false);
  });

  it('does not document make hooks or changelog.html in the README or Makefile', () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    assert.doesNotMatch(readme, /changelog\.html/);
    assert.doesNotMatch(readme, /make hooks/);
    assert.doesNotMatch(readme, /SKIP_OUTLINER_CHANGELOG/);
    const makefile = readFileSync(join(repoRoot, 'Makefile'), 'utf8');
    assert.doesNotMatch(makefile, /\bhooks\b/);
    assert.doesNotMatch(makefile, /\.githooks/);
  });
});
