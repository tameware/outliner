import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { mountOutliner } from '../outliner.js';
import {
  clipboardPlainText,
  pastePlainTextIntoLine,
  handleOutlinePaste,
} from '../outline-paste.js';
import { SUIT_GLYPHS } from '../suit-shortcuts.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {string} [lineText]
 */
function setup(lineText = 'Hello') {
  const dom = new JSDOM(
    `<!DOCTYPE html><body>
      <ol class="outline" data-outline-root>
        <li data-item data-state="expanded" data-has-children="false">
          <div class="row">
            <button type="button" class="toggle"></button>
            <div class="text" contenteditable="true">${lineText}</div>
          </div>
        </li>
      </ol>
      <input id="outside" value="other" />
    </body>`,
    { url: 'http://localhost/' },
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  const api = mountOutliner(document.querySelector('[data-outline-root]'));
  const text = document.querySelector('.text');
  return { dom, api, text };
}

/**
 * @param {HTMLElement} el
 * @param {number} start
 * @param {number} [end]
 */
function placeCaret(el, start, end = start) {
  el.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  const node = el.firstChild || el;
  if (node.nodeType === Node.TEXT_NODE) {
    const len = node.textContent.length;
    range.setStart(node, Math.min(start, len));
    range.setEnd(node, Math.min(end, len));
  } else {
    range.selectNodeContents(el);
    range.collapse(true);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * @param {string | null | undefined} plain
 * @param {string | null | undefined} [html]
 */
function mockClipboard(plain, html) {
  return {
    getData(type) {
      if (type === 'text/plain') return plain ?? '';
      if (type === 'text/html') return html ?? '';
      return '';
    },
  };
}

/**
 * @param {string | null | undefined} plain
 * @param {string | null | undefined} [html]
 */
function pasteEvent(plain, html) {
  const event = new window.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    configurable: true,
    value: mockClipboard(plain, html),
  });
  return event;
}

describe('outline paste uses the default font', () => {
  beforeEach(() => {
    setup();
  });

  it('reads plain text from the clipboard and ignores HTML markup', () => {
    assert.equal(
      clipboardPlainText(
        mockClipboard(
          'World',
          '<span style="font-family: Comic Sans MS">World</span>',
        ),
      ),
      'World',
    );
  });

  it('falls back to HTML text content when plain text is missing', () => {
    assert.equal(
      clipboardPlainText(
        mockClipboard(
          '',
          '<span style="font-family: Papyrus">OnlyHtml</span>',
        ),
      ),
      'OnlyHtml',
    );
  });

  it('pastes plain text into the line without font spans', () => {
    const { text } = setup('Hi');
    placeCaret(text, 2);
    pastePlainTextIntoLine(text, ' there');
    assert.equal(text.textContent, 'Hi there');
    assert.equal(text.querySelector('[style]'), null);
    assert.equal(text.querySelector('span:not(.suit)'), null);
  });

  it('replaces the selection with pasted plain text', () => {
    const { text } = setup('Hello');
    placeCaret(text, 1, 4);
    pastePlainTextIntoLine(text, 'i');
    assert.equal(text.textContent, 'Hio');
  });

  it('wraps pasted red suit glyphs for display', () => {
    const { text } = setup('');
    placeCaret(text, 0);
    pastePlainTextIntoLine(text, `A${SUIT_GLYPHS.hearts}K`);
    assert.equal(text.textContent, `A${SUIT_GLYPHS.hearts}K`);
    assert.equal(text.querySelector('.suit-red')?.textContent, SUIT_GLYPHS.hearts);
  });

  it('intercepts paste on a .text line and drops rich font HTML', () => {
    const { text } = setup('Go');
    placeCaret(text, 2);
    const event = pasteEvent(
      'od',
      '<span style="font-family: Courier New">od</span>',
    );
    text.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(text.textContent, 'Good');
    assert.equal(text.querySelector('[style]'), null);
  });

  it('does not intercept paste outside outline .text', () => {
    setup();
    const input = document.getElementById('outside');
    input.focus();
    const event = pasteEvent('x', '<b style="font-family: Impact">x</b>');
    assert.equal(handleOutlinePaste(event), false);
    assert.equal(event.defaultPrevented, false);
  });

  it('wires paste handling from mountOutliner / outline-paste.js', () => {
    const outlinerJs = readFileSync(join(rootDir, 'outliner.js'), 'utf8');
    assert.match(outlinerJs, /outline-paste\.js/);
    assert.match(outlinerJs, /bindOutlinePlainPaste|handleOutlinePaste/);
  });
});
