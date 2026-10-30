import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPML_FILE_TYPES,
  supportsFileSystemAccess,
  localSaveMenuLabel,
  suggestedOpmlFilename,
  titleFromOpmlFileName,
  outlineTitleForLocalOpen,
  openOpmlWithFilePicker,
  saveOpmlWithFilePicker,
  writeOpmlToFileHandle,
  saveOutlineLocally,
  isAbortError,
  isFilePickerUnavailableError,
} from '../local-file.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('local file (File System Access)', () => {
  it('detects picker support from the window', () => {
    const stub = {
      showOpenFilePicker: () => {},
      showSaveFilePicker: () => {},
      self: null,
      top: null,
      navigator: { userAgent: 'Mozilla/5.0 Chrome/120' },
    };
    stub.self = stub;
    stub.top = stub;
    assert.equal(supportsFileSystemAccess(stub), true);
    assert.equal(supportsFileSystemAccess({}), false);
    assert.equal(
      supportsFileSystemAccess({ showOpenFilePicker: () => {} }),
      false,
    );
  });

  it('treats iframes and Electron shells as unsupported for pickers', () => {
    const iframe = {
      showOpenFilePicker: () => {},
      showSaveFilePicker: () => {},
      self: {},
      top: {},
      navigator: { userAgent: 'Mozilla/5.0 Chrome/120' },
    };
    assert.equal(supportsFileSystemAccess(iframe), false);

    const electron = {
      showOpenFilePicker: () => {},
      showSaveFilePicker: () => {},
      self: null,
      top: null,
      navigator: { userAgent: 'Mozilla/5.0 Electron/28.0.0 Chrome/120' },
    };
    electron.self = electron;
    electron.top = electron;
    assert.equal(supportsFileSystemAccess(electron), false);
  });

  it('labels Save… until a file handle exists, then Save', () => {
    assert.equal(localSaveMenuLabel(false), 'Save…');
    assert.equal(localSaveMenuLabel(true), 'Save');
  });

  it('suggests an .opml filename from the document title', () => {
    assert.equal(suggestedOpmlFilename('Bridge notes'), 'Bridge notes.opml');
    assert.equal(suggestedOpmlFilename('Deal.opml'), 'Deal.opml');
    assert.equal(suggestedOpmlFilename(''), 'outline.opml');
    assert.equal(suggestedOpmlFilename('Tameware Outliner'), 'outline.opml');
  });

  it('derives the outline name from the on-disk file name, stripping .opml', () => {
    assert.equal(titleFromOpmlFileName('Bridge notes.opml'), 'Bridge notes');
    assert.equal(titleFromOpmlFileName('Deal.OPML'), 'Deal');
    assert.equal(titleFromOpmlFileName('  shopping list.opml  '), 'shopping list');
    assert.equal(titleFromOpmlFileName('.opml'), '');
    assert.equal(titleFromOpmlFileName(''), '');
    assert.equal(titleFromOpmlFileName(null), '');
  });

  it('prefers the file name over the OPML head title when opening locally', () => {
    assert.equal(
      outlineTitleForLocalOpen('Bridge notes.opml', 'Different OPML title'),
      'Bridge notes',
    );
    assert.equal(
      outlineTitleForLocalOpen('notes.opml', ''),
      'notes',
    );
    assert.equal(
      outlineTitleForLocalOpen('', 'OPML only title'),
      'OPML only title',
    );
    assert.equal(outlineTitleForLocalOpen('.opml', 'Fallback'), 'Fallback');
  });

  it('declares OPML accept types for the pickers', () => {
    assert.ok(Array.isArray(OPML_FILE_TYPES));
    assert.ok(OPML_FILE_TYPES[0].accept['text/x-opml'].includes('.opml'));
  });

  it('openOpmlWithFilePicker returns handle, name, and parsed text', async () => {
    const handle = {
      async getFile() {
        return {
          name: 'deal.opml',
          async text() {
            return '<?xml version="1.0"?><opml version="2.0"><head><title>Deal</title></head><body></body></opml>';
          },
        };
      },
    };
    const result = await openOpmlWithFilePicker({
      showOpenFilePicker: async () => [handle],
    });
    assert.equal(result.handle, handle);
    assert.equal(result.name, 'deal.opml');
    assert.match(result.text, /<title>Deal<\/title>/);
  });

  it('openOpmlWithFilePicker returns null when the user cancels', async () => {
    const err = new Error('cancel');
    err.name = 'AbortError';
    const result = await openOpmlWithFilePicker({
      showOpenFilePicker: async () => {
        throw err;
      },
    });
    assert.equal(result, null);
  });

  it('classifies cancel vs unavailable picker errors', () => {
    const abort = new Error('cancel');
    abort.name = 'AbortError';
    assert.equal(isAbortError(abort), true);
    assert.equal(isFilePickerUnavailableError(abort), false);

    const security = new Error('no gesture');
    security.name = 'SecurityError';
    assert.equal(isFilePickerUnavailableError(security), true);

    const denied = new Error('denied');
    denied.name = 'NotAllowedError';
    assert.equal(isFilePickerUnavailableError(denied), true);

    const unsupported = new Error('nope');
    unsupported.name = 'NotSupportedError';
    assert.equal(isFilePickerUnavailableError(unsupported), true);
  });

  it('writeOpmlToFileHandle writes and closes a writable stream', async () => {
    const writes = [];
    let closed = false;
    const handle = {
      async createWritable() {
        return {
          async write(data) {
            writes.push(data);
          },
          async close() {
            closed = true;
          },
        };
      },
    };
    await writeOpmlToFileHandle(handle, '<opml></opml>');
    assert.deepEqual(writes, ['<opml></opml>']);
    assert.equal(closed, true);
  });

  it('saveOpmlWithFilePicker picks a file then writes contents', async () => {
    const writes = [];
    const handle = {
      name: 'out.opml',
      async createWritable() {
        return {
          async write(data) {
            writes.push(data);
          },
          async close() {},
        };
      },
    };
    /** @type {unknown} */
    let pickerOpts;
    const saved = await saveOpmlWithFilePicker('<opml/>', {
      suggestedName: 'Bridge.opml',
      showSaveFilePicker: async (opts) => {
        pickerOpts = opts;
        return handle;
      },
    });
    assert.equal(saved, handle);
    assert.equal(/** @type {{ suggestedName?: string }} */ (pickerOpts).suggestedName, 'Bridge.opml');
    assert.deepEqual(writes, ['<opml/>']);
  });

  it('saveOpmlWithFilePicker returns null when the user cancels', async () => {
    const err = new Error('cancel');
    err.name = 'AbortError';
    const result = await saveOpmlWithFilePicker('<opml/>', {
      showSaveFilePicker: async () => {
        throw err;
      },
    });
    assert.equal(result, null);
  });

  it('saveOutlineLocally does not download when the save picker is cancelled', async () => {
    const downloads = [];
    const result = await saveOutlineLocally({
      contents: '<opml/>',
      suggestedName: 'notes.opml',
      supportsFsa: true,
      saveWithPicker: async () => null,
      download: (contents, name) => {
        downloads.push({ contents, name });
      },
    });
    assert.deepEqual(result, { ok: false, reason: 'cancelled', handle: null });
    assert.deepEqual(downloads, []);
  });

  it('saveOutlineLocally does not download when the save picker throws AbortError or NotAllowedError', async () => {
    const downloads = [];
    for (const name of ['AbortError', 'NotAllowedError', 'SecurityError']) {
      const err = new Error(name);
      err.name = name;
      const result = await saveOutlineLocally({
        contents: '<opml/>',
        suggestedName: 'notes.opml',
        supportsFsa: true,
        saveWithPicker: async () => {
          throw err;
        },
        download: (contents, filename) => {
          downloads.push({ contents, filename });
        },
      });
      assert.equal(result.ok, false, name);
      assert.equal(result.reason, 'cancelled', name);
    }
    assert.deepEqual(downloads, []);
  });

  it('saveOutlineLocally downloads only when File System Access is unsupported', async () => {
    const downloads = [];
    const result = await saveOutlineLocally({
      contents: '<opml/>',
      suggestedName: 'notes.opml',
      supportsFsa: false,
      download: (contents, filename) => {
        downloads.push({ contents, filename });
      },
    });
    assert.deepEqual(result, { ok: true, reason: 'download', handle: null });
    assert.deepEqual(downloads, [{ contents: '<opml/>', filename: 'notes.opml' }]);
  });
});

describe('index.html File Open / Save', () => {
  it('lists Open…, Insert…, Save…, and Save As… in the File menu', () => {
    const html = readFileSync(join(repoRoot, 'index.html'), 'utf8');
    const fileAt = html.indexOf('data-menu="file"');
    const editAt = html.indexOf('data-menu="edit"');
    const panel = html.slice(fileAt, editAt);
    assert.match(panel, /id="menu-file-open"[^>]*>\s*Open…\s*</);
    assert.match(panel, /id="menu-insert-import"[^>]*>\s*Insert…\s*</);
    assert.match(panel, /id="menu-file-save"/);
    assert.match(panel, /id="menu-file-save-as"[^>]*>\s*Save As…\s*</);
    assert.ok(
      panel.indexOf('id="menu-file-open"') < panel.indexOf('id="menu-insert-import"') &&
        panel.indexOf('id="menu-insert-import"') < panel.indexOf('id="menu-file-save"') &&
        panel.indexOf('id="menu-file-save"') < panel.indexOf('id="menu-file-save-as"'),
    );
    assert.doesNotMatch(panel, /id="menu-import"/);
    assert.doesNotMatch(panel, /id="menu-export"/);
    assert.doesNotMatch(panel, />Import…</);
    assert.doesNotMatch(panel, />Export…</);
    assert.doesNotMatch(panel, /Insert Import/);
  });

  it('wires local-file helpers from app.js', () => {
    const appJs = readFileSync(join(repoRoot, 'app.js'), 'utf8');
    assert.match(appJs, /from ['"]\.\/local-file\.js['"]/);
    assert.match(appJs, /menu-file-open/);
    assert.match(appJs, /menu-file-save/);
    assert.match(appJs, /menu-file-save-as/);
    assert.match(appJs, /forcePicker\s*:\s*true|saveLocalOutline\(\s*\{\s*forcePicker/);
    assert.match(appJs, /supportsFileSystemAccess|openOpmlWithFilePicker/);
    assert.match(
      appJs,
      /outlineTitleForLocalOpen\(fallbackName,\s*tree\.title\)/,
    );
    assert.match(
      appJs,
      /const title = outlineTitleForLocalOpen\(fallbackName,\s*tree\.title\);\s*\n\s*if \(title\) applyDocumentTitle\(title\);/,
    );
  });
});
