#!/usr/bin/env node
/**
 * Bump OUTLINER_VERSION (major.minor → next minor) and prepend a Change Log entry.
 * Used by .githooks/prepare-commit-msg so each commit ships a new version.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const OUTLINER_MENU_VERSION_RE =
  /export const OUTLINER_VERSION = '(\d+)\.(\d+)';/;

/** @param {string} version major.minor */
export function bumpMinorVersion(version) {
  const match = /^(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!match) throw new Error(`Expected major.minor version, got ${version}`);
  return `${match[1]}.${Number(match[2]) + 1}`;
}

/** @param {string} text */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * First non-comment, non-empty line of a commit message file.
 * @param {string} messageText
 */
export function primaryCommitSummary(messageText) {
  for (const line of String(messageText).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    return trimmed;
  }
  return '';
}

/**
 * @param {string} html
 * @param {{ version: string, date: string, summary: string }} entry
 */
export function prependChangelogEntry(html, { version, date, summary }) {
  const marker = 'id="changelog-entries"';
  const start = html.indexOf(marker);
  if (start < 0) throw new Error('changelog.html missing id="changelog-entries"');
  const openEnd = html.indexOf('>', start);
  if (openEnd < 0) throw new Error('changelog.html: malformed changelog-entries tag');
  const article = [
    '',
    `<article data-version="${escapeHtml(version)}">`,
    `  <h2>${escapeHtml(version)} <time datetime="${escapeHtml(date)}">${escapeHtml(date)}</time></h2>`,
    '  <ul>',
    `    <li>${escapeHtml(summary)}</li>`,
    '  </ul>',
    '</article>',
    '',
  ].join('\n');
  return `${html.slice(0, openEnd + 1)}${article}${html.slice(openEnd + 1)}`;
}

/**
 * @param {string} menuSource
 * @param {{ version: string, date: string }} next
 */
export function rewriteOutlinerMenuVersion(menuSource, { version, date }) {
  if (!OUTLINER_MENU_VERSION_RE.test(menuSource)) {
    throw new Error('outliner-menu.js missing OUTLINER_VERSION export');
  }
  let next = menuSource.replace(
    OUTLINER_MENU_VERSION_RE,
    `export const OUTLINER_VERSION = '${version}';`,
  );
  if (!/export const OUTLINER_UPDATED = '\d{4}-\d{2}-\d{2}';/.test(next)) {
    throw new Error('outliner-menu.js missing OUTLINER_UPDATED export');
  }
  next = next.replace(
    /export const OUTLINER_UPDATED = '\d{4}-\d{2}-\d{2}';/,
    `export const OUTLINER_UPDATED = '${date}';`,
  );
  return next;
}

/**
 * @param {string} rootDir
 * @param {{ summary: string, date?: string }} options
 */
export function applyReleaseToTree(rootDir, { summary, date }) {
  const isoDate = date || new Date().toISOString().slice(0, 10);
  const summaryText = String(summary || '').trim();
  if (!summaryText) throw new Error('Commit summary is empty; skip changelog bump');

  const menuPath = join(rootDir, 'outliner-menu.js');
  const changelogPath = join(rootDir, 'changelog.html');
  const packagePath = join(rootDir, 'package.json');
  const lockPath = join(rootDir, 'package-lock.json');

  const menuSource = readFileSync(menuPath, 'utf8');
  const versionMatch = OUTLINER_MENU_VERSION_RE.exec(menuSource);
  if (!versionMatch) throw new Error('Could not read OUTLINER_VERSION');
  const previousVersion = `${versionMatch[1]}.${versionMatch[2]}`;
  const version = bumpMinorVersion(previousVersion);
  const packageVersion = `${version}.0`;

  writeFileSync(
    menuPath,
    rewriteOutlinerMenuVersion(menuSource, { version, date: isoDate }),
  );

  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  pkg.version = packageVersion;
  writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.version = packageVersion;
    if (lock.packages && lock.packages['']) {
      lock.packages[''].version = packageVersion;
    }
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  } catch (err) {
    if (err && err.code !== 'ENOENT') throw err;
  }

  const changelog = readFileSync(changelogPath, 'utf8');
  writeFileSync(
    changelogPath,
    prependChangelogEntry(changelog, {
      version,
      date: isoDate,
      summary: summaryText,
    }),
  );

  return { previousVersion, version, date: isoDate, summary: summaryText };
}

function main(argv) {
  if (process.env.SKIP_OUTLINER_CHANGELOG === '1') {
    process.stderr.write('SKIP_OUTLINER_CHANGELOG=1; leaving version unchanged.\n');
    return;
  }
  const messageFileIdx = argv.indexOf('--message-file');
  if (messageFileIdx < 0 || !argv[messageFileIdx + 1]) {
    throw new Error('Usage: changelog-release.js --message-file <path>');
  }
  const messagePath = argv[messageFileIdx + 1];
  const summary = primaryCommitSummary(readFileSync(messagePath, 'utf8'));
  if (!summary) {
    process.stderr.write('Empty commit message; skipping changelog bump.\n');
    return;
  }
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = applyReleaseToTree(rootDir, { summary });
  process.stderr.write(
    `Change Log: ${result.previousVersion} → ${result.version} (${result.summary})\n`,
  );
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err?.message || err}\n`);
    process.exit(1);
  }
}
