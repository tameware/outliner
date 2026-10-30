import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const prepare = readFileSync(join(repoRoot, '.githooks/prepare-commit-msg'), 'utf8');
const post = readFileSync(join(repoRoot, '.githooks/post-commit'), 'utf8');

describe('changelog githooks', () => {
  it('clears pending/amend markers when skipping merge, squash, amend, or SKIP', () => {
    assert.match(prepare, /PENDING=.*outliner-changelog-pending/);
    assert.match(prepare, /AMEND=.*outliner-changelog-amend/);
    assert.match(prepare, /clear_markers\(\) \{\s*\n\s*rm -f "\$PENDING" "\$AMEND"/);
    assert.match(
      prepare,
      /case "\$SOURCE" in[\s\S]*merge\|squash\|commit\)\s*\n\s*clear_markers/,
    );
    assert.match(
      prepare,
      /SKIP_OUTLINER_CHANGELOG:-\}" = "1" \]; then\s*\n\s*clear_markers/,
    );
  });

  it('refuses to bump when release files have unstaged edits', () => {
    assert.match(prepare, /RELEASE_FILES="outliner-menu\.js package\.json/);
    assert.match(prepare, /git diff --quiet -- \$RELEASE_FILES/);
    assert.match(prepare, /Unstaged changes in release files/);
    assert.match(post, /git diff --quiet -- \$RELEASE_FILES/);
  });

  it('amends only the four release files, not the whole index', () => {
    assert.match(
      post,
      /git commit --amend --no-edit --no-verify -- \$RELEASE_FILES/,
    );
    assert.equal((post.match(/git commit --amend/g) || []).length, 1);
    assert.match(post, /amend_release_files\(\)/);
  });
});
