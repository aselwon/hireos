#!/usr/bin/env node
// Does every Mermaid block parse?
//
// qoq-artist runs this before it writes a chart, because a broken diagram in a
// raw GitHub view is worse than none. It is `mermaid.parse()` under jsdom — the
// grammar GitHub renders with, minus the browser — so a chart that passes can
// still lay out badly, but it can't fail to render.
//
// The skill ships no dependencies, so the pinned pair is installed here, once
// per machine, into the OS temp dir. That's `npm install`, not `npx`: this
// skill's hook blocks any npx but qoq, and a script can't import from npx's
// cache anyway. Offline after the first run, until tmp is cleared.
//
// Usage:   node mermaid-check.mjs <file.md|file.mmd|->...
//   .md       every ```mermaid block in it, located by line and qoq-artist id
//   .mmd, -   the whole file, or stdin, as one chart — or its fences, if it
//             starts with one
//
// Exit code: 0 every block parses (or there are none), 1 any fails, 2 the
// validator is unavailable or usage is wrong. The artist branches on the code:
// 1 is its to fix, 2 means write the chart marked `unvalidated`.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PACKAGES = ['mermaid@11.4.1', 'jsdom@25.0.1'];
const PREFIX = join(tmpdir(), 'qoq-mermaid-11.4.1');

const FENCE_OPEN = /^\s{0,3}```mermaid\s*$/;
const FENCE_CLOSE = /^\s{0,3}```\s*$/;
const MARKER = /<!--\s*qoq-artist id:\s*([\w-]+)/;

/**
 * Mermaid blocks in Markdown. `line` is the fence's own, 1-based; `id` comes from
 * a marker on the nearest non-blank line above — prettier puts a blank line
 * between an HTML comment and a fence, so "directly above" never survives it.
 */
export const blocks = (markdown) => {
  const lines = markdown.split('\n');
  const found = [];

  for (let i = 0; i < lines.length; i++) {
    if (!FENCE_OPEN.test(lines[i])) {
      continue;
    }

    const end = lines.findIndex((line, j) => j > i && FENCE_CLOSE.test(line));
    // An unclosed fence runs to the end of the file, as GitHub renders it.
    const stop = end === -1 ? lines.length : end;
    const above = lines.slice(0, i).findLast((line) => line.trim() !== '');
    found.push({
      line: i + 1,
      id: above?.match(MARKER)?.[1] ?? null,
      code: lines.slice(i + 1, stop).join('\n'),
    });
    i = stop;
  }

  return found;
};

const loadMermaid = async () => {
  if (!existsSync(join(PREFIX, 'node_modules', 'mermaid'))) {
    // ponytail: only the two top-level versions are pinned; transitive deps float.
    // Commit a lockfile beside this script if one ever breaks parsing.
    const install = spawnSync(
      'npm',
      [
        'install',
        '--prefix',
        PREFIX,
        '--no-save',
        '--no-audit',
        '--no-fund',
        '--ignore-scripts',
        '--loglevel=error',
        ...PACKAGES,
      ],
      { encoding: 'utf8', shell: process.platform === 'win32' }
    );

    if (install.status !== 0) {
      throw new Error(
        `npm install failed: ${(install.stderr || install.error?.message || '').trim().split('\n')[0]}`
      );
    }
  }

  const require = createRequire(join(PREFIX, 'package.json'));
  const { JSDOM } = await import(pathToFileURL(require.resolve('jsdom')).href);
  // A URL, because without one jsdom's origin is opaque and touching localStorage throws.
  const { window } = new JSDOM('', { url: 'http://localhost/' });
  // Labels go through DOMPurify, which reaches for Element, Node and friends as
  // bare globals — so hand over every one jsdom has that Node doesn't.
  globalThis.window = window;
  for (const name of Object.getOwnPropertyNames(window)) {
    if (!(name in globalThis)) {
      globalThis[name] = window[name];
    }
  }

  return (await import(pathToFileURL(require.resolve('mermaid')).href)).default;
};

const main = async (paths) => {
  if (paths.length === 0) {
    process.stderr.write('usage: mermaid-check.mjs <file.md|file.mmd|->...\n');
    return 2;
  }

  const charts = paths.flatMap((path) => {
    const text = readFileSync(path === '-' ? 0 : path, 'utf8');
    // A bare chart is one block; anything holding a ```mermaid fence — a .md file,
    // or the fenced block the artist returns as `printed` — is read for its fences.
    return path.endsWith('.md') ||
      FENCE_OPEN.test(text.split('\n').find((line) => line.trim()) ?? '')
      ? blocks(text).map((block) => ({ ...block, path }))
      : [{ path, line: 1, id: null, code: text }];
  });

  if (charts.length === 0) {
    process.stdout.write('no mermaid blocks\n');
    return 0;
  }

  let mermaid;
  try {
    mermaid = await loadMermaid();
  } catch (error) {
    process.stdout.write(`unavailable: ${error.message}\n`);
    return 2;
  }

  let failed = false;
  for (const { path, line, id, code } of charts) {
    const where = id ? `${path}:${line} [${id}]` : `${path}:${line}`;
    try {
      await mermaid.parse(code);
      process.stdout.write(`ok   ${where}\n`);
    } catch (error) {
      failed = true;
      process.stdout.write(
        `FAIL ${where}\n  ${String(error.message).split('\n').slice(0, 4).join('\n  ')}\n`
      );
    }
  }

  return failed ? 1 : 0;
};

// import.meta.url is realpath'd and argv[1] isn't — compare real paths, so the
// .claude/skills/qoq symlink still runs main.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
