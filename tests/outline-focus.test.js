import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { loadOutline, getItemTexts } from '../outliner.js';
import {
  focusOutlineItem,
  unfocusOutline,
  clearOutlineFocus,
  isOutlineFocusActive,
  syncOutlineFocus,
} from '../outline-focus.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function setupDom() {
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <ol class="outline" data-outline-root></ol>
  </body>`);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.HTMLElement = dom.window.HTMLElement;
  return document.querySelector('[data-outline-root]');
}

describe('outline Focus / Unfocus', () => {
  /** @type {HTMLElement} */
  let root;

  beforeEach(() => {
    root = setupDom();
    loadOutline(root, {
      items: [
        {
          text: 'Alpha',
          children: [
            {
              text: 'Beta',
              children: [{ text: 'Gamma', children: [] }],
            },
            { text: 'Delta', children: [] },
          ],
        },
        { text: 'Epsilon', children: [] },
      ],
    });
  });

  it('Focus hides siblings and ancestor rows, keeping the focused item and descendants', () => {
    const items = [...root.querySelectorAll('[data-item]')];
    const betaItem = items.find(
      (el) => el.querySelector(':scope > .row > .text')?.textContent === 'Beta',
    );
    assert.ok(betaItem);
    assert.equal(focusOutlineItem(root, betaItem), true);
    assert.equal(isOutlineFocusActive(root), true);

    const alpha = items.find(
      (el) => el.querySelector(':scope > .row > .text')?.textContent === 'Alpha',
    );
    const delta = items.find(
      (el) => el.querySelector(':scope > .row > .text')?.textContent === 'Delta',
    );
    const epsilon = items.find(
      (el) => el.querySelector(':scope > .row > .text')?.textContent === 'Epsilon',
    );
    const gamma = items.find(
      (el) => el.querySelector(':scope > .row > .text')?.textContent === 'Gamma',
    );

    assert.equal(alpha.dataset.focusRole, 'ancestor');
    assert.equal(betaItem.dataset.focusRole, 'visible');
    assert.equal(gamma.dataset.focusRole, 'visible');
    assert.equal(delta.dataset.focusRole, 'hidden');
    assert.equal(epsilon.dataset.focusRole, 'hidden');
    assert.equal(root.hasAttribute('data-focused'), true);
  });

  it('nested Focus drills in; Unfocus restores the previous level then clears', () => {
    const items = () =>
      [...root.querySelectorAll('[data-item]')].reduce((map, el) => {
        map[el.querySelector(':scope > .row > .text')?.textContent] = el;
        return map;
      }, /** @type {Record<string, HTMLElement>} */ ({}));

    assert.equal(focusOutlineItem(root, items().Beta), true);
    assert.equal(focusOutlineItem(root, items().Gamma), true);
    assert.equal(items().Beta.dataset.focusRole, 'ancestor');
    assert.equal(items().Gamma.dataset.focusRole, 'visible');
    assert.equal(items().Alpha.dataset.focusRole, 'ancestor');

    assert.equal(unfocusOutline(root), true);
    assert.equal(items().Beta.dataset.focusRole, 'visible');
    assert.equal(items().Gamma.dataset.focusRole, 'visible');
    assert.equal(items().Delta.dataset.focusRole, 'hidden');

    assert.equal(unfocusOutline(root), true);
    assert.equal(isOutlineFocusActive(root), false);
    assert.equal(root.hasAttribute('data-focused'), false);
    assert.equal(items().Epsilon.dataset.focusRole, undefined);
    assert.equal(unfocusOutline(root), false);
  });

  it('Focus outside the current zoom starts a new focus stack', () => {
    const byText = (t) =>
      [...root.querySelectorAll('[data-item]')].find(
        (el) => el.querySelector(':scope > .row > .text')?.textContent === t,
      );
    focusOutlineItem(root, byText('Beta'));
    assert.equal(focusOutlineItem(root, byText('Epsilon')), true);
    assert.equal(byText('Epsilon').dataset.focusRole, 'visible');
    assert.equal(byText('Alpha').dataset.focusRole, 'hidden');
    assert.equal(unfocusOutline(root), true);
    assert.equal(isOutlineFocusActive(root), false);
  });

  it('syncOutlineFocus prunes deleted focus roots and refreshes roles', () => {
    const byText = (t) =>
      [...root.querySelectorAll('[data-item]')].find(
        (el) => el.querySelector(':scope > .row > .text')?.textContent === t,
      );
    const beta = byText('Beta');
    focusOutlineItem(root, beta);
    beta.remove();
    syncOutlineFocus(root);
    assert.equal(isOutlineFocusActive(root), false);
    assert.equal(byText('Alpha').dataset.focusRole, undefined);
  });

  it('syncOutlineFocus refreshes roles after structural moves', () => {
    const byText = (t) =>
      [...root.querySelectorAll('[data-item]')].find(
        (el) => el.querySelector(':scope > .row > .text')?.textContent === t,
      );
    const beta = byText('Beta');
    focusOutlineItem(root, beta);
    const epsilon = byText('Epsilon');
    let children = beta.querySelector(':scope > ol');
    if (!children) {
      children = document.createElement('ol');
      beta.appendChild(children);
    }
    children.appendChild(epsilon);
    syncOutlineFocus(root);
    assert.equal(epsilon.dataset.focusRole, 'visible');
  });

  it('clearOutlineFocus and loadOutline clear focus state', () => {
    const beta = [...root.querySelectorAll('[data-item]')].find(
      (el) => el.querySelector(':scope > .row > .text')?.textContent === 'Beta',
    );
    focusOutlineItem(root, beta);
    clearOutlineFocus(root);
    assert.equal(isOutlineFocusActive(root), false);
    assert.equal(beta.dataset.focusRole, undefined);

    focusOutlineItem(root, beta);
    loadOutline(root, { items: [{ text: 'Only', children: [] }] });
    assert.equal(isOutlineFocusActive(root), false);
    assert.deepEqual(getItemTexts(root), ['Only']);
  });

  it('lists Focus and Unfocus in the View menu before Expand All', () => {
    const html = readFileSync(join(repoRoot, 'index.html'), 'utf8');
    const viewAt = html.indexOf('data-menu="view"');
    const cloudAt = html.indexOf('data-menu="cloud"');
    const panel = html.slice(viewAt, cloudAt);
    assert.match(panel, /id="menu-focus"[^>]*>\s*Focus\s*</);
    assert.match(panel, /id="menu-unfocus"[^>]*>\s*Unfocus\s*</);
    assert.ok(panel.indexOf('menu-focus') < panel.indexOf('menu-expand-all'));
    assert.ok(panel.indexOf('menu-unfocus') < panel.indexOf('menu-expand-all'));
  });

  it('wires Focus / Unfocus from app.js', () => {
    const appJs = readFileSync(join(repoRoot, 'app.js'), 'utf8');
    assert.match(appJs, /focusOutlineItem/);
    assert.match(appJs, /unfocusOutline/);
    assert.match(appJs, /syncOutlineFocus/);
    assert.match(appJs, /menu-focus/);
    assert.match(appJs, /menu-unfocus/);
  });
});
