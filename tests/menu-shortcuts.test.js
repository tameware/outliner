import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import { applyMenuShortcuts, formatMenuShortcut } from '../menu-shortcuts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('formatMenuShortcut', () => {
  it('formats Mac modifier chords with symbols', () => {
    assert.equal(formatMenuShortcut('mod+z', { mac: true }), '⌘Z');
    assert.equal(formatMenuShortcut('mod+shift+z', { mac: true }), '⇧⌘Z');
    assert.equal(formatMenuShortcut('shift+tab', { mac: true }), '⇧⇥');
    assert.equal(formatMenuShortcut('tab', { mac: true }), '⇥');
    assert.equal(formatMenuShortcut('mod+[', { mac: true }), '⌘[');
    assert.equal(formatMenuShortcut('mod+]', { mac: true }), '⌘]');
    assert.equal(formatMenuShortcut('mod+alt+f', { mac: true }), '⌥⌘F');
    assert.equal(formatMenuShortcut('mod+up', { mac: true }), '⌘↑');
    assert.equal(formatMenuShortcut('mod+down', { mac: true }), '⌘↓');
  });

  it('formats non-Mac chords with Ctrl/Shift words', () => {
    assert.equal(formatMenuShortcut('mod+z', { mac: false }), 'Ctrl+Z');
    assert.equal(formatMenuShortcut('mod+shift+z', { mac: false }), 'Ctrl+Shift+Z');
    assert.equal(formatMenuShortcut('shift+tab', { mac: false }), 'Shift+Tab');
    assert.equal(formatMenuShortcut('tab', { mac: false }), 'Tab');
    assert.equal(formatMenuShortcut('mod+[', { mac: false }), 'Ctrl+[');
    assert.equal(formatMenuShortcut('mod+alt+f', { mac: false }), 'Ctrl+Alt+F');
    assert.equal(formatMenuShortcut('mod+up', { mac: false }), 'Ctrl+Up');
    assert.equal(formatMenuShortcut('mod+down', { mac: false }), 'Ctrl+Down');
  });
});

describe('applyMenuShortcuts', () => {
  it('fills .menu-shortcut elements from data-keys for the platform', () => {
    const dom = new JSDOM(`<!DOCTYPE html><body>
      <button role="menuitem" id="menu-undo">
        Undo<span class="menu-shortcut" data-keys="mod+z"></span>
      </button>
      <button role="menuitem" id="menu-indent">
        Indent<span class="menu-shortcut" data-keys="tab"></span>
      </button>
    </body>`);
    applyMenuShortcuts(dom.window.document, { mac: true });
    assert.equal(
      dom.window.document.querySelector('#menu-undo .menu-shortcut').textContent,
      '⌘Z',
    );
    assert.equal(
      dom.window.document.querySelector('#menu-indent .menu-shortcut').textContent,
      '⇥',
    );
  });
});

describe('index.html menu shortcuts', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');

  it('marks Edit actions that have keyboard shortcuts', () => {
    for (const [id, keys] of [
      ['menu-undo', 'mod+z'],
      ['menu-redo', 'mod+shift+z'],
      ['menu-indent', 'tab'],
      ['menu-outdent', 'shift+tab'],
      ['menu-move-up', 'mod+up'],
      ['menu-move-down', 'mod+down'],
      ['menu-promote', 'mod+['],
      ['menu-demote', 'mod+]'],
      ['menu-find', 'mod+f'],
      ['menu-replace', 'mod+alt+f'],
    ]) {
      const start = html.indexOf(`id="${id}"`);
      assert.ok(start >= 0, `expected ${id}`);
      const chunk = html.slice(start, start + 220);
      assert.match(chunk, /class="menu-shortcut"/);
      assert.ok(
        chunk.includes(`data-keys="${keys}"`),
        `${id} should declare data-keys="${keys}"`,
      );
    }
  });

  it('app applies menu shortcuts on boot', () => {
    const appJs = readFileSync(join(root, 'app.js'), 'utf8');
    assert.match(appJs, /applyMenuShortcuts/);
  });
});

describe('menu shortcut styles', () => {
  it('styles .menu-shortcut in the stylesheet', () => {
    const css = readFileSync(join(root, 'styles.css'), 'utf8');
    assert.match(css, /\.menu-shortcut\s*\{/);
    assert.match(css, /\.menu-panel \[role=['"]menuitem['"]\]\s*\{[^}]*display\s*:\s*flex/);
  });
});
