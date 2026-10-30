// node --test skills/qoq/scripts/mermaid-check.node-test.mjs
//
// Extraction is pure and always runs. The parse tests drive the script as a
// subprocess, the way qoq-artist does, and skip on exit 2: the first run per
// machine installs the validator, and an offline pre-push must not fail on it.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { blocks } from './mermaid-check.mjs';

const SCRIPT = new URL('mermaid-check.mjs', import.meta.url).pathname;

const check = (name, text) => {
  const path = join(mkdtempSync(join(tmpdir(), 'mermaid-check-')), name);
  writeFileSync(path, text);
  return spawnSync(process.execPath, [SCRIPT, path], { encoding: 'utf8' });
};

test('finds each block with its fence line and the marker id above it, across the blank line prettier adds', () => {
  const md = [
    '# Doc',
    '<!-- qoq-artist id: token-lifecycle unvalidated -->',
    '',
    '```mermaid',
    'stateDiagram-v2',
    '```',
    '',
    '<!-- qoq-artist id: not-this-one -->',
    'A paragraph a person wrote.',
    '',
    '```mermaid',
    'flowchart TD',
    '```',
  ].join('\n');

  assert.deepEqual(blocks(md), [
    { line: 4, id: 'token-lifecycle', code: 'stateDiagram-v2' },
    { line: 11, id: null, code: 'flowchart TD' },
  ]);
});

test('ignores other fences and keeps an unclosed one to the end of the file', () => {
  assert.deepEqual(blocks('```js\nconst a = 1;\n```\n```mermaid\nflowchart TD\n  A --> B'), [
    { line: 4, id: null, code: 'flowchart TD\n  A --> B' },
  ]);
});

test('a file with no mermaid blocks passes without loading the validator', () => {
  const result = check('plain.md', '# Nothing to draw\n');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /no mermaid blocks/);
});

test('a valid chart passes and a broken one fails with its location', (t) => {
  const good = check('good.mmd', 'stateDiagram-v2\n  [*] --> Idle\n');
  if (good.status === 2) {
    t.skip(`validator unavailable: ${good.stdout.trim()}`);
    return;
  }
  assert.equal(good.status, 0, good.stdout);

  const bad = check(
    'bad.md',
    '<!-- qoq-artist id: broken -->\n```mermaid\nflowchart TD\n  A --> --> B(\n```\n'
  );
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /^FAIL .*bad\.md:2 \[broken\]/m);
});

test('stdin holding a fenced chart is read for its fence, not parsed fence and all', (t) => {
  const result = spawnSync(process.execPath, [SCRIPT, '-'], {
    encoding: 'utf8',
    input: '```mermaid\nstateDiagram-v2\n  [*] --> Idle\n```\n',
  });
  if (result.status === 2) {
    t.skip(`validator unavailable: ${result.stdout.trim()}`);
    return;
  }
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /^ok {3}-:1$/m);
});
