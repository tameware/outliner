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
    <header>
      <div class="document-heading">
        <p id="document-title" class="document-title">Untitled</p>
      </div>
    </header>
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
    title: document.getElementById('document-title'),
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

  it('clears the document title so Untitled does not flash while opening', () => {
    assert.equal(els.title.textContent, 'Untitled');
    showOutlineLoading(els.root, { loadOutline });
    assert.equal(els.title.textContent, '');
  });

  it('deep-link boot clears Untitled for opaque view and edit share links', () => {
    assert.equal(
      blankOutlineForDeepLink(
        els.root,
        { search: '?view=opaque-share' },
        { loadOutline },
      ),
      true,
    );
    assert.equal(els.title.textContent, '');

    els = setupDom();
    assert.equal(
      blankOutlineForDeepLink(
        els.root,
        { search: '?edit=opaque-edit' },
        { loadOutline },
      ),
      true,
    );
    assert.equal(els.title.textContent, '');
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
      /main\[data-loading\]\s*\[data-outline-root\][\s\S]*?\{[^}]*display\s*:\s*none/,
    );
  });

  it('hides the outline via html[data-outline-loading] before main exists', () => {
    const css = readFileSync(join(repoRoot, 'styles.css'), 'utf8');
    assert.match(
      css,
      /html\[data-outline-loading\]\s*\[data-outline-root\]\s*\{[^}]*display\s*:\s*none/s,
    );
    assert.match(
      css,
      /html\[data-outline-loading\]\s*\.outline-loading/s,
    );
  });

  it('showOutlineLoading sets html[data-outline-loading] and hide clears it', () => {
    showOutlineLoading(els.root, { loadOutline });
    assert.equal(document.documentElement.getAttribute('data-outline-loading'), 'true');
    hideOutlineLoading(els.root);
    assert.equal(document.documentElement.hasAttribute('data-outline-loading'), false);
  });

  it('index.html does not bake Untitled into #document-title (avoids share-link flash)', () => {
    const html = readFileSync(join(repoRoot, 'index.html'), 'utf8');
    const chunk = html.slice(
      html.indexOf('id="document-title"'),
      html.indexOf('id="document-updated"'),
    );
    assert.doesNotMatch(chunk, />\s*Untitled\s*</);
  });

  it('app.js skips syncing Untitled into the heading while the outline is loading', () => {
    const appJs = readFileSync(join(repoRoot, 'app.js'), 'utf8');
    assert.match(appJs, /isOutlineLoading/);
    assert.match(
      appJs,
      /function syncDocumentTitles\([\s\S]*?isOutlineLoading\(root\)/,
    );
  });
});
