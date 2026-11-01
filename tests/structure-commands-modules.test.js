/**
 * Locks merged key/menu modules for Move Up/Down and Indent/Outdent.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('structure command modules', () => {
  it('keeps move-up-down as a single module (keys + menu)', async () => {
    await access(join(root, 'src/outliner/move-up-down.js'));
    await assert.rejects(() => access(join(root, 'src/outliner/move-up-down-keys.js')));
    await assert.rejects(() => access(join(root, 'src/outliner/move-up-down-menu.js')));
  });

  it('keeps indent-outdent as a single module (menu entry)', async () => {
    await access(join(root, 'src/outliner/indent-outdent.js'));
    await assert.rejects(() =>
      access(join(root, 'src/outliner/indent-outdent-menu.js')),
    );
  });

  it('exports move shortcut helpers and mountMoveUpDownMenu together', async () => {
    const mod = await import('../src/outliner/move-up-down.js');
    assert.equal(typeof mod.isForeignMoveShortcutTarget, 'function');
    assert.equal(typeof mod.matchMoveUpDownShortcut, 'function');
    assert.equal(typeof mod.handleMoveUpDownShortcut, 'function');
    assert.equal(typeof mod.mountMoveUpDownMenu, 'function');
  });

  it('exports mountIndentOutdentMenu from indent-outdent.js', async () => {
    const mod = await import('../src/outliner/indent-outdent.js');
    assert.equal(typeof mod.mountIndentOutdentMenu, 'function');
  });

  it('outline-chrome imports the merged modules', () => {
    const src = readFileSync(join(root, 'src/chrome/outline-chrome.js'), 'utf8');
    assert.match(src, /from ['"]\.\.\/outliner\/move-up-down\.js['"]/);
    assert.match(src, /from ['"]\.\.\/outliner\/indent-outdent\.js['"]/);
    assert.doesNotMatch(src, /move-up-down-keys|move-up-down-menu|indent-outdent-menu/);
  });
});
