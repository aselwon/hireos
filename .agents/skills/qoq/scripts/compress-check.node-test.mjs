// node --test skills/qoq/scripts/compress-check.node-test.mjs
//
// The contract is the exit code plus the two lists, so the test drives the
// script as a subprocess the way `qoq compress` does, and reads stdout only to
// confirm *which* literal it named — a check that exits 1 for the wrong reason
// is worse than one that doesn't run.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const SCRIPT = new URL('compress-check.mjs', import.meta.url).pathname;

const check = (original, compressed) => {
  const root = mkdtempSync(join(tmpdir(), 'compress-check-'));
  const before = join(root, 'before.md');
  const after = join(root, 'after.md');
  writeFileSync(before, original);
  writeFileSync(after, compressed);
  const { status, stdout } = spawnSync(process.execPath, [SCRIPT, before, after], {
    encoding: 'utf8',
  });
  return { status, stdout };
};

test('cutting prose while keeping every literal is clean', () => {
  const { status } = check(
    'It is worth noting that the build, which is important, runs `npm run build`.',
    'Build: `npm run build`.'
  );
  assert.equal(status, 0);
});

test('a dropped command fails and is named', () => {
  const { status, stdout } = check(
    'Run `npm run build` and then `npm test`.',
    'Run `npm run build`.'
  );
  assert.equal(status, 1);
  assert.match(stdout, /dropped\s+npm test/);
});

test('a command inside a fence survives as a whole line, not tokens', () => {
  const { status, stdout } = check(
    '```bash\nnode scripts/summarize.mjs <report dir>\n```\n',
    'Summarize the reports.\n'
  );
  assert.equal(status, 1);
  assert.match(stdout, /dropped\s+node scripts\/summarize\.mjs <report dir>/);
});

test('a comment inside a fence is prose, not a literal', () => {
  const { status } = check(
    '```bash\n# Install dependencies\nnpm install\n```\n',
    '`npm install`\n'
  );
  assert.equal(status, 0);
});

test('a fenced command survives being rewritten inline without its comment', () => {
  const { status } = check(
    '```bash\nnpm run qoq:check   # full check\n```\n',
    '| `npm run qoq:check` | full check |\n'
  );
  assert.equal(status, 0);
});

test('a URL in a fence keeps its slashes — only whitespace starts a comment', () => {
  const { status, stdout } = check('```\ncurl https://x.dev/a\n```\n', 'no curl here\n');
  assert.equal(status, 1);
  assert.match(stdout, /dropped\s+curl https:\/\/x\.dev\/a/);
});

test('a bare path nobody backticked still counts', () => {
  const { status, stdout } = check('Tests live in packages/cli/src.', 'Tests live in the CLI.');
  assert.equal(status, 1);
  assert.match(stdout, /dropped\s+packages\/cli\/src/);
});

test('a path that appears twice and survives once is not a drop', () => {
  const { status } = check(
    'See `AGENTS.md`. As mentioned, `AGENTS.md` has the flags.',
    '`AGENTS.md` has the flags.'
  );
  assert.equal(status, 0);
});

test('an invented filename fails — compression never creates a path', () => {
  const { status, stdout } = check('Config lives in `qoq.config.js`.', 'Config: `qoq.config.ts`.');
  assert.equal(status, 1);
  assert.match(stdout, /invented\s+qoq\.config\.ts/);
});

test('prose abbreviations are not mistaken for filenames', () => {
  const { status } = check(
    'Prefer tables over prose, e.g. this one, vs. a paragraph.',
    'Prefer tables.'
  );
  assert.equal(status, 0);
});

test('the word delta is reported even on a clean run', () => {
  const { stdout } = check('one two three four', 'one two');
  assert.match(stdout, /4 → 2 words \(-50%\)/);
});

test('a missing second argument is a usage error, not a verdict', () => {
  const root = mkdtempSync(join(tmpdir(), 'compress-check-'));
  const only = join(root, 'only.md');
  writeFileSync(only, 'x');
  assert.equal(spawnSync(process.execPath, [SCRIPT, only]).status, 2);
});
