import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  OUTLINE_LOADING_MESSAGE,
  showOutlineLoading,
  hideOutlineLoading,
  isOutlineLoading,
} from '../outline-loading.js';
import { blankOutlineForDeepLink } from '../deep-link-boot.js';
import { loadOutline, getItemTexts } from '../outliner.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function setupDom(starter = true) {
  const tip = starter
    ? `<li data-item><div class="row"><button type="button" class="toggle"></button><div class="text">Starter tip</div></div></li>`
    : '';
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <main>
      <p id="outline-loading" class="outline-loading" hidden>${OUTLINE_LOADING_MESSAGE}</p>
      <ol class="outline" data-outline-root>${tip}</ol>
    </main>
  </body>`);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  return {
    main: document.querySelector('main'),
    root: document.querySelector('[data-outline-root]'),
    loading: document.getElementById('outline-loading'),
  };
}

describe('outline loading panel', () => {
  /** @type {{ main: HTMLElement, root: HTMLElement, loading: HTMLElement }} */
  let els;

  beforeEach(() => {
    els = setupDom();
  });

  it('shows a blank loading panel and hides the outline', () => {
    showOutlineLoading(els.root, { loadOutline });
    assert.equal(els.loading.hidden, false);
    assert.equal(els.loading.textContent, 'Loading your outline…');
    assert.equal(els.main.getAttribute('data-loading'), 'true');
    assert.equal(isOutlineLoading(els.root), true);
    assert.deepEqual(getItemTexts(els.root), ['']);
  });

  it('hideOutlineLoading restores the outline panel', () => {
    showOutlineLoading(els.root, { loadOutline });
    hideOutlineLoading(els.root);
    assert.equal(els.loading.hidden, true);
    assert.equal(els.main.hasAttribute('data-loading'), false);
    assert.equal(isOutlineLoading(els.root), false);
  });

  it('deep-link boot shows loading instead of the starter outline', () => {
    assert.equal(
      blankOutlineForDeepLink(els.root, { search: '?id=abc' }, { loadOutline }),
      true,
    );
    assert.equal(isOutlineLoading(els.root), true);
    assert.equal(els.loading.hidden, false);
    assert.deepEqual(getItemTexts(els.root), ['']);
  });

  it('deep-link boot blanks for opaque read-only ?view= links', () => {
    assert.equal(
      blankOutlineForDeepLink(
        els.root,
        { search: '?view=opaque-share' },
        { loadOutline },
      ),
      true,
    );
    assert.equal(isOutlineLoading(els.root), true);
    assert.deepEqual(getItemTexts(els.root), ['']);
  });

  it('places the loading message in index.html ahead of the outline', () => {
    const html = readFileSync(join(repoRoot, 'index.html'), 'utf8');
    assert.match(html, /id="outline-loading"/);
    assert.match(html, /Loading your outline…/);
    assert.ok(html.indexOf('id="outline-loading"') < html.indexOf('data-outline-root'));
  });

  it('hides the outline while main is loading via CSS', () => {
    const css = readFileSync(join(repoRoot, 'styles.css'), 'utf8');
    assert.match(
      css,
      /main\[data-loading\]\s*\[data-outline-root\]\s*\{[^}]*display\s*:\s*none/s,
    );
  });

  it('runs an early sync paint script before the outline so deep links never flash starter HTML', () => {
    const html = readFileSync(join(repoRoot, 'index.html'), 'utf8');
    assert.match(html, /<script\s+src="\.\/deep-link-paint\.js"><\/script>/);
    assert.doesNotMatch(html, /<script\s+type="module"\s+src="\.\/deep-link-paint/);
    const paintAt = html.indexOf('deep-link-paint.js');
    const outlineAt = html.indexOf('data-outline-root');
    assert.ok(paintAt >= 0 && paintAt < outlineAt);

    const paint = readFileSync(join(repoRoot, 'deep-link-paint.js'), 'utf8');
    assert.match(paint, /data-loading/);
    assert.match(paint, /outline-loading/);
    assert.match(paint, /view/);
  });
});
