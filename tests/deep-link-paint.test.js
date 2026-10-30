import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { OUTLINE_LOADING_MESSAGE } from '../outline-loading.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const paintSource = readFileSync(join(repoRoot, 'deep-link-paint.js'), 'utf8');

/**
 * Paint must run in <head> before <main> exists — that is the FOUC case for share links.
 * @param {string} search
 */
function runPaintInHead(search) {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head>
      <script>${paintSource}</script>
    </head><body>
      <p id="document-title">Untitled</p>
      <main>
        <p id="outline-loading" class="outline-loading" hidden>${OUTLINE_LOADING_MESSAGE}</p>
        <ol class="outline" data-outline-root>
          <li data-item><div class="row"><div class="text">Starter tip</div></div></li>
        </ol>
      </main>
    </body></html>`,
    {
      url: `http://localhost/outliner/${search}`,
      runScripts: 'dangerously',
    },
  );
  const doc = dom.window.document;
  return {
    html: doc.documentElement,
    main: doc.querySelector('main'),
    loading: doc.getElementById('outline-loading'),
    title: doc.getElementById('document-title'),
    tip: doc.querySelector('.text')?.textContent,
  };
}

describe('deep-link early paint', () => {
  it('marks html before main exists so ?view= shares never paint the starter outline', () => {
    const { html, main, tip } = runPaintInHead('?view=opaque-share');
    assert.equal(html.getAttribute('data-outline-loading'), 'true');
    // Script ran in <head>; main was not available yet — attribute on html is required.
    assert.equal(main.hasAttribute('data-loading'), false);
    assert.equal(tip, 'Starter tip');
  });

  it('marks html for ?id= and ?edit= deep links from head', () => {
    for (const search of ['?id=file-9', '?edit=opaque-edit']) {
      const { html } = runPaintInHead(search);
      assert.equal(html.getAttribute('data-outline-loading'), 'true', search);
    }
  });

  it('leaves the page alone when there is no remote outline param', () => {
    const { html, main, loading } = runPaintInHead('');
    assert.equal(html.hasAttribute('data-outline-loading'), false);
    assert.equal(main.hasAttribute('data-loading'), false);
    assert.equal(loading.hidden, true);

    const legacy = runPaintInHead('?view=1');
    assert.equal(legacy.html.hasAttribute('data-outline-loading'), false);
  });

  it('index.html loads deep-link-paint.js from head before the outline body', () => {
    const html = readFileSync(join(repoRoot, 'index.html'), 'utf8');
    const headEnd = html.indexOf('</head>');
    const paintAt = html.indexOf('deep-link-paint.js');
    const outlineAt = html.indexOf('data-outline-root');
    assert.ok(paintAt >= 0 && paintAt < headEnd);
    assert.ok(paintAt < outlineAt);
    assert.doesNotMatch(html, /<script\s+type="module"\s+src="\.\/deep-link-paint/);
    const paint = readFileSync(join(repoRoot, 'deep-link-paint.js'), 'utf8');
    assert.match(paint, /data-outline-loading/);
    assert.match(paint, /documentElement/);
  });
});
