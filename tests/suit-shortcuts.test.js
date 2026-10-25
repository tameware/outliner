import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  matchSuitShortcut,
  tryInsertSuitShortcut,
  SUIT_GLYPHS,
} from '../suit-shortcuts.js';
import { mountOutliner, getItemText } from '../outliner.js';

describe('suit shortcuts', () => {
  it('maps !c !d !h !s to clubs diamonds hearts spades', () => {
    assert.equal(matchSuitShortcut('Hello!', 'c'), SUIT_GLYPHS.clubs);
    assert.equal(matchSuitShortcut('!', 'd'), SUIT_GLYPHS.diamonds);
    assert.equal(matchSuitShortcut('A!', 'h'), SUIT_GLYPHS.hearts);
    assert.equal(matchSuitShortcut('x!', 's'), SUIT_GLYPHS.spades);
    assert.equal(matchSuitShortcut('!', 'C'), SUIT_GLYPHS.clubs);
  });

  it('does not match without a preceding bang or for other keys', () => {
    assert.equal(matchSuitShortcut('c', 'c'), null);
    assert.equal(matchSuitShortcut('!c', 'c'), null);
    assert.equal(matchSuitShortcut('!', 'x'), null);
    assert.equal(matchSuitShortcut('', 'c'), null);
  });

  describe('DOM insertion', () => {
    let text;

    beforeEach(() => {
      const dom = new JSDOM(`<!DOCTYPE html><body>
        <ol class="outline" data-outline-root>
          <li data-item>
            <div class="row">
              <button type="button" class="toggle"></button>
              <div class="text" contenteditable="true" contentEditable="true">AK!</div>
            </div>
          </li>
        </ol>
      </body>`, { url: 'http://localhost/' });
      globalThis.window = dom.window;
      globalThis.document = dom.window.document;
      globalThis.Node = dom.window.Node;
      mountOutliner(document.querySelector('[data-outline-root]'));
      text = document.querySelector('.text');
      text.focus();
      const range = document.createRange();
      range.selectNodeContents(text);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    it('replaces !c with the clubs glyph at the caret', () => {
      assert.equal(tryInsertSuitShortcut(text, 'c'), true);
      assert.equal(text.textContent, `AK${SUIT_GLYPHS.clubs}`);
      assert.equal(getItemText(document.querySelector('[data-item]')), `AK${SUIT_GLYPHS.clubs}`);
      assert.equal(text.querySelector('.suit-red'), null);
    });

    it('wraps hearts and diamonds in a red suit span', () => {
      assert.equal(tryInsertSuitShortcut(text, 'h'), true);
      assert.equal(text.textContent, `AK${SUIT_GLYPHS.hearts}`);
      const heart = text.querySelector('.suit-red');
      assert.ok(heart);
      assert.equal(heart.textContent, SUIT_GLYPHS.hearts);

      text.textContent = 'Q!';
      const range = document.createRange();
      range.selectNodeContents(text);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      assert.equal(tryInsertSuitShortcut(text, 'd'), true);
      assert.equal(text.querySelector('.suit-red').textContent, SUIT_GLYPHS.diamonds);
    });

    it('is triggered from keydown on a text line', () => {
      const event = new window.KeyboardEvent('keydown', {
        key: 's',
        bubbles: true,
        cancelable: true,
      });
      text.dispatchEvent(event);
      assert.equal(event.defaultPrevented, true);
      assert.equal(text.textContent, `AK${SUIT_GLYPHS.spades}`);
    });
  });
});
