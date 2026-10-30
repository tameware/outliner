import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bumpMinorVersion,
  escapeHtml,
  prependChangelogEntry,
  applyReleaseToTree,
  OUTLINER_MENU_VERSION_RE,
} from '../scripts/changelog-release.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('changelog release helpers', () => {
  it('bumps only the part after the decimal point', () => {
    assert.equal(bumpMinorVersion('1.0'), '1.1');
    assert.equal(bumpMinorVersion('1.9'), '1.10');
    assert.equal(bumpMinorVersion('2.3'), '2.4');
  });

  it('escapes HTML in commit summaries', () => {
    assert.equal(escapeHtml('A <b> & "c"'), 'A &lt;b&gt; &amp; &quot;c&quot;');
  });

  it('prepends a versioned entry inside #changelog-entries', () => {
    const html = `<!DOCTYPE html><html><body>
<main><div id="changelog-entries">
<article data-version="1.0"><h2>1.0</h2><ul><li>Old</li></ul></article>
</div></main></body></html>`;
    const next = prependChangelogEntry(html, {
      version: '1.1',
      date: '2026-10-28',
      summary: 'Add Change Log',
    });
    assert.match(next, /data-version="1\.1"/);
    assert.match(next, /<time datetime="2026-10-28">2026-10-28<\/time>/);
    assert.match(next, /<li>Add Change Log<\/li>/);
    assert.ok(next.indexOf('data-version="1.1"') < next.indexOf('data-version="1.0"'));
  });

  it('bumps outliner-menu, package.json, package-lock, and changelog in a tree', () => {
    const dir = mkdtempSync(join(tmpdir(), 'outliner-changelog-'));
    try {
      writeFileSync(
        join(dir, 'outliner-menu.js'),
        `export const OUTLINER_VERSION = '1.0';\nexport const OUTLINER_UPDATED = '2026-01-01';\n`,
      );
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'html-outliner', version: '1.0.0' }, null, 2) + '\n',
      );
      writeFileSync(
        join(dir, 'package-lock.json'),
        JSON.stringify(
          { name: 'html-outliner', version: '1.0.0', lockfileVersion: 3, packages: { '': { version: '1.0.0' } } },
          null,
          2,
        ) + '\n',
      );
      writeFileSync(
        join(dir, 'changelog.html'),
        `<!DOCTYPE html><html><body><div id="changelog-entries">
<article data-version="1.0"><h2>1.0 <time datetime="2026-01-01">2026-01-01</time></h2><ul><li>Start</li></ul></article>
</div></body></html>\n`,
      );

      const result = applyReleaseToTree(dir, {
        summary: 'Ship changelog automation',
        date: '2026-10-28',
      });

      assert.equal(result.previousVersion, '1.0');
      assert.equal(result.version, '1.1');
      assert.match(readFileSync(join(dir, 'outliner-menu.js'), 'utf8'), OUTLINER_MENU_VERSION_RE);
      assert.match(
        readFileSync(join(dir, 'outliner-menu.js'), 'utf8'),
        /OUTLINER_VERSION = '1\.1'/,
      );
      assert.match(
        readFileSync(join(dir, 'outliner-menu.js'), 'utf8'),
        /OUTLINER_UPDATED = '2026-10-28'/,
      );
      assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version, '1.1.0');
      const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
      assert.equal(lock.version, '1.1.0');
      assert.equal(lock.packages[''].version, '1.1.0');
      assert.match(readFileSync(join(dir, 'changelog.html'), 'utf8'), /Ship changelog automation/);
      assert.match(readFileSync(join(dir, 'changelog.html'), 'utf8'), /data-version="1\.1"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ships a changelog.html page with an entries container', () => {
    const html = readFileSync(join(repoRoot, 'changelog.html'), 'utf8');
    assert.match(html, /<title>Change Log/i);
    assert.match(html, /id="changelog-entries"/);
    assert.match(html, /href="\.\/"/);
  });
});
