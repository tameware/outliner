import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  hasRemoteOutlineParams,
  blankOutlineForDeepLink,
} from '../deep-link-boot.js';
import { loadOutline, getItemTexts } from '../outliner.js';

describe('deep-link boot', () => {
  it('detects outline id query params', () => {
    assert.equal(hasRemoteOutlineParams({ search: '' }), false);
    assert.equal(hasRemoteOutlineParams({ search: '?foo=1' }), false);
    assert.equal(hasRemoteOutlineParams({ search: '?id=abc' }), true);
    assert.equal(hasRemoteOutlineParams({ search: '?id=a&view=1' }), true);
    assert.equal(hasRemoteOutlineParams({ search: '?view=1' }), false);
    assert.equal(hasRemoteOutlineParams({ search: '?view=opaque-view' }), true);
    assert.equal(hasRemoteOutlineParams({ search: '?edit=opaque-edit' }), true);
  });

  it('clears the default outline when id is present', () => {
    const dom = new JSDOM(`<!DOCTYPE html><body>
      <ol class="outline" data-outline-root>
        <li data-item>
          <div class="row">
            <button type="button" class="toggle"></button>
            <div class="text" contenteditable="true">Default tip</div>
          </div>
        </li>
      </ol>
    </body>`);
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    const root = document.querySelector('[data-outline-root]');

    assert.equal(
      blankOutlineForDeepLink(root, { search: '?id=xyz' }, { loadOutline }),
      true,
    );
    assert.deepEqual(getItemTexts(root), ['']);
  });

  it('leaves the outline alone when there is no remote param', () => {
    const dom = new JSDOM(`<!DOCTYPE html><body>
      <ol class="outline" data-outline-root>
        <li data-item>
          <div class="row">
            <button type="button" class="toggle"></button>
            <div class="text" contenteditable="true">Keep me</div>
          </div>
        </li>
      </ol>
    </body>`);
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    const root = document.querySelector('[data-outline-root]');

    assert.equal(
      blankOutlineForDeepLink(root, { search: '' }, { loadOutline }),
      false,
    );
    assert.deepEqual(getItemTexts(root), ['Keep me']);
  });
});
