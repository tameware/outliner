import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OUTLINER_UPDATED,
  OUTLINER_VERSION,
} from '../src/chrome/outliner-version.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('outliner version stamp', () => {
  it('package.json build regenerates outliner-version.js', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert.match(pkg.scripts.build, /build-outliner-version/);
  });

  it('matches package.json major.minor and git HEAD commit date', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const majorMinor = pkg.version.split('.').slice(0, 2).join('.');
    const gitDate = execFileSync('git', ['log', '-1', '--format=%cs'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    assert.equal(OUTLINER_VERSION, majorMinor);
    assert.match(OUTLINER_UPDATED, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(OUTLINER_UPDATED, gitDate);
  });
});
