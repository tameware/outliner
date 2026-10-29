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
 * @param {string} search
 */
function runPaint(search) {
  const dom = new JSDOM(
    `<!DOCTYPE html><body>
      <main>
        <p id="outline-loading" class="outline-loading" hidden>${OUTLINE_LOADING_MESSAGE}</p>
        <script>${paintSource}</script>
        <ol class="outline" data-outline-root>
          <li data-item><div class="row"><div class="text">Starter tip</div></div></li>
        </ol>
      </main>
    </body>`,
    {
      url: `http://localhost/outliner/${search}`,
      runScripts: 'dangerously',
    },
  );
  return {
    main: dom.window.document.querySelector('main'),
    loading: dom.window.document.getElementById('outline-loading'),
    tip: dom.window.document.querySelector('.text')?.textContent,
  };
}

describe('deep-link early paint', () => {
  it('shows loading and marks main before the starter outline for ?view= shares', () => {
    const { main, loading, tip } = runPaint('?view=opaque-share');
    assert.equal(main.getAttribute('data-loading'), 'true');
    assert.equal(loading.hidden, false);
    assert.equal(tip, 'Starter tip');
  });

  it('shows loading for ?id= and ?edit= deep links', () => {
    for (const search of ['?id=file-9', '?edit=opaque-edit']) {
      const { main, loading } = runPaint(search);
      assert.equal(main.getAttribute('data-loading'), 'true', search);
      assert.equal(loading.hidden, false, search);
    }
  });

  it('leaves the starter outline alone when there is no remote outline param', () => {
    const { main, loading } = runPaint('');
    assert.equal(main.hasAttribute('data-loading'), false);
    assert.equal(loading.hidden, true);

    const legacy = runPaint('?view=1');
    assert.equal(legacy.main.hasAttribute('data-loading'), false);
  });
});
