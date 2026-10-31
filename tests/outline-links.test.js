import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { fillTextWithSuits, SUIT_GLYPHS } from '../suit-shortcuts.js';
import {
  findWebLinks,
  hrefForWebLink,
  bindOutlineLinks,
} from '../outline-links.js';
import { mountOutliner, loadOutline, getItemText } from '../outliner.js';

describe('web links in outline text', () => {
  it('findWebLinks locates http(s) and www URLs and trims trailing punctuation', () => {
    assert.deepEqual(findWebLinks('see https://example.com/path.'), [
      { start: 4, end: 28, text: 'https://example.com/path' },
    ]);
    assert.deepEqual(findWebLinks('https://a.test and www.b.test/x!'), [
      { start: 0, end: 14, text: 'https://a.test' },
      { start: 19, end: 31, text: 'www.b.test/x' },
    ]);
    assert.deepEqual(findWebLinks('no links here'), []);
  });

  it('hrefForWebLink adds https for bare www hosts', () => {
    assert.equal(hrefForWebLink('https://example.com'), 'https://example.com');
    assert.equal(hrefForWebLink('http://example.com'), 'http://example.com');
    assert.equal(hrefForWebLink('www.example.com/a'), 'https://www.example.com/a');
  });

  it('fillTextWithSuits wraps URLs as outline-link anchors alongside red suits', () => {
    const dom = new JSDOM('<!DOCTYPE html><body><div class="text"></div></body>', {
      url: 'http://localhost/',
    });
    globalThis.document = dom.window.document;
    const el = document.querySelector('.text');
    const plain = `Lead ${SUIT_GLYPHS.hearts} https://example.com/hand`;
    fillTextWithSuits(el, plain);
    assert.equal(el.textContent, plain);
    assert.equal(el.querySelector('.suit-red')?.textContent, SUIT_GLYPHS.hearts);
    const link = el.querySelector('a.outline-link');
    assert.ok(link);
    assert.equal(link.textContent, 'https://example.com/hand');
    assert.equal(link.getAttribute('href'), 'https://example.com/hand');
    assert.equal(link.getAttribute('target'), '_blank');
    assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
    assert.equal(link.getAttribute('contenteditable'), 'false');
  });

  describe('bindOutlineLinks', () => {
    /** @type {ReturnType<typeof JSDOM>['window']} */
    let win;
    /** @type {HTMLElement} */
    let root;
    /** @type {string[]} */
    let opened;

    beforeEach(() => {
      const dom = new JSDOM(
        `<!DOCTYPE html><body>
          <div data-outline-root>
            <ol class="outline"></ol>
          </div>
        </body>`,
        { url: 'http://localhost/', pretendToBeVisual: true },
      );
      win = dom.window;
      globalThis.window = win;
      globalThis.document = win.document;
      globalThis.Node = win.Node;
      globalThis.HTMLElement = win.HTMLElement;
      root = document.querySelector('[data-outline-root]');
      opened = [];
      win.open = (url) => {
        opened.push(String(url));
        return null;
      };
      mountOutliner(root);
      loadOutline(root, {
        items: [{ text: 'Read https://example.com/docs please', children: [] }],
      });
    });

    it('opens a wrapped link in a new tab when clicked', () => {
      const link = root.querySelector('a.outline-link');
      assert.ok(link, 'load should create outline-link anchors via mountOutliner');
      link.dispatchEvent(
        new win.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
      assert.deepEqual(opened, ['https://example.com/docs']);
    });

    it('linkifies a typed URL when the line blurs', () => {
      const item = root.querySelector('[data-item]');
      const text = item.querySelector('.text');
      text.textContent = 'Visit www.example.org/x for more';
      assert.equal(text.querySelector('a.outline-link'), null);
      text.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true }));
      const link = text.querySelector('a.outline-link');
      assert.ok(link);
      assert.equal(link.textContent, 'www.example.org/x');
      assert.equal(link.getAttribute('href'), 'https://www.example.org/x');
      assert.equal(getItemText(item), 'Visit www.example.org/x for more');
    });

    it('bindOutlineLinks can be attached with an explicit fillLine', () => {
      const dom = new JSDOM(
        `<!DOCTYPE html><body>
          <div data-outline-root>
            <ol class="outline"></ol>
          </div>
        </body>`,
        { url: 'http://localhost/', pretendToBeVisual: true },
      );
      globalThis.window = dom.window;
      globalThis.document = dom.window.document;
      globalThis.Node = dom.window.Node;
      globalThis.HTMLElement = dom.window.HTMLElement;
      const opened2 = [];
      dom.window.open = (url) => {
        opened2.push(String(url));
        return null;
      };
      const r = document.querySelector('[data-outline-root]');
      mountOutliner(r, { bindEvents: false });
      bindOutlineLinks(r, { fillLine: fillTextWithSuits });
      loadOutline(r, {
        items: [{ text: 'https://wired.example/', children: [] }],
      });
      const link = r.querySelector('a.outline-link');
      assert.ok(link);
      link.dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
      assert.deepEqual(opened2, ['https://wired.example/']);
    });
  });
});
