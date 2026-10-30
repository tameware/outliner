import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  matchSuitShortcut,
  tryInsertSuitShortcut,
  fillTextWithSuits,
  expandSuitBangShortcuts,
  tryInsertSuitShortcutInInput,
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

  it('expandSuitBangShortcuts turns !c !d !h !s into glyphs', () => {
    assert.equal(
      expandSuitBangShortcuts('Lead !h then !d vs !s!c'),
      `Lead ${SUIT_GLYPHS.hearts} then ${SUIT_GLYPHS.diamonds} vs ${SUIT_GLYPHS.spades}${SUIT_GLYPHS.clubs}`,
    );
    assert.equal(expandSuitBangShortcuts('!H !D'), `${SUIT_GLYPHS.hearts} ${SUIT_GLYPHS.diamonds}`);
    assert.equal(expandSuitBangShortcuts('plain'), 'plain');
  });

  it('tryInsertSuitShortcutInInput replaces ! plus letter in a text input', () => {
    const dom = new JSDOM('<!DOCTYPE html><body><input id="r" /></body>', {
      url: 'http://localhost/',
    });
    globalThis.document = dom.window.document;
    const input = document.getElementById('r');
    input.value = 'AK!';
    input.selectionStart = 3;
    input.selectionEnd = 3;
    assert.equal(tryInsertSuitShortcutInInput(input, 'h'), true);
    assert.equal(input.value, `AK${SUIT_GLYPHS.hearts}`);
    assert.equal(input.selectionStart, 3);
  });

  describe('fillTextWithSuits', () => {
    it('wraps hearts and diamonds in red while leaving black suits as text', () => {
      const dom = new JSDOM('<!DOCTYPE html><body><div class="text"></div></body>', {
        url: 'http://localhost/',
      });
      globalThis.document = dom.window.document;
      const el = document.querySelector('.text');
      const plain = `A${SUIT_GLYPHS.spades}K${SUIT_GLYPHS.hearts} vs ${SUIT_GLYPHS.diamonds}${SUIT_GLYPHS.clubs}`;
      fillTextWithSuits(el, plain);
      assert.equal(el.textContent, plain);
      const reds = [...el.querySelectorAll('.suit-red')].map((n) => n.textContent);
      assert.deepEqual(reds, [SUIT_GLYPHS.hearts, SUIT_GLYPHS.diamonds]);
      const red = el.querySelector('.suit-red');
      assert.equal(red?.className, 'suit suit-red');
      assert.equal(red?.getAttribute('contenteditable'), 'false');
    });

    it('clears the element when given empty text', () => {
      const dom = new JSDOM(
        `<!DOCTYPE html><body><div class="text"><span class="suit suit-red">${SUIT_GLYPHS.hearts}</span></div></body>`,
        { url: 'http://localhost/' },
      );
      globalThis.document = dom.window.document;
      const el = document.querySelector('.text');
      fillTextWithSuits(el, '');
      assert.equal(el.textContent, '');
      assert.equal(el.childNodes.length, 0);
    });
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

    it('keeps following typed text outside the red suit span', () => {
      assert.equal(tryInsertSuitShortcut(text, 'h'), true);
      const heart = text.querySelector('.suit-red');
      assert.ok(heart);
      assert.equal(heart.getAttribute('contenteditable'), 'false');

      const sel = window.getSelection();
      const caret = sel.getRangeAt(0);
      assert.equal(
        heart.contains(caret.startContainer),
        false,
        'caret must sit after the suit, not inside .suit-red',
      );

      caret.insertNode(document.createTextNode('QJT'));
      assert.equal(heart.textContent, SUIT_GLYPHS.hearts);
      assert.equal(text.textContent, `AK${SUIT_GLYPHS.hearts}QJT`);
      assert.equal(heart.querySelector('*'), null);
      assert.ok(
        [...text.childNodes].some(
          (n) => n.nodeType === Node.TEXT_NODE && n.textContent.includes('QJT'),
        ),
      );
    });

    it('keeps every heart and diamond on the line wrapped in red', () => {
      assert.equal(tryInsertSuitShortcut(text, 'h'), true);
      text.appendChild(document.createTextNode(' vs !'));
      const range = document.createRange();
      range.selectNodeContents(text);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      assert.equal(tryInsertSuitShortcut(text, 'd'), true);
      assert.equal(
        text.textContent,
        `AK${SUIT_GLYPHS.hearts} vs ${SUIT_GLYPHS.diamonds}`,
      );
      const reds = [...text.querySelectorAll('.suit-red')].map((el) => el.textContent);
      assert.deepEqual(reds, [SUIT_GLYPHS.hearts, SUIT_GLYPHS.diamonds]);
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
