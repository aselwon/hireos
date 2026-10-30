// node --test skills/qoq/scripts/npx-guard.node-test.mjs
//
// The guard is SKILL.md's own PreToolUse hook, inline because a hook command
// gets no ${CLAUDE_SKILL_DIR} to find a script by. So this runs the command
// exactly as the frontmatter ships it, fed the JSON Claude Code sends.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
const [, indent, block] = skill.match(/\n( +)command: \|\n((?:\1 .*\n)+)/);
const hook = block.replaceAll(new RegExp(`^${indent}  `, 'gm'), '');

const guard = (command) =>
  spawnSync('bash', ['-c', hook], {
    encoding: 'utf8',
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
  });

test('lets qoq and non-npx commands through', () => {
  for (const command of [
    'npx qoq --check --json',
    'npx qoq',
    'npx --yes qoq staged src/a.ts',
    'cd packages/cli && npx qoq --fix',
    'npm test',
    'npm run test:execute -- src/a.spec.ts',
    'echo npxfoo',
  ]) {
    assert.equal(guard(command).status, 0, command);
  }
});

test('blocks npx for anything but qoq, with the reason on stderr', () => {
  for (const command of [
    'npx vitest run',
    'npx tsc --noEmit',
    'npm test && npx eslint .',
    'npx -y vitest',
    'npx qoqx',
    '(npx prettier --check .)',
  ]) {
    const { status, stderr } = guard(command);
    assert.equal(status, 2, command);
    assert.match(stderr, /npx is for qoq and nothing else/);
  }
});

test('a payload with no command passes', () => {
  const { status } = spawnSync('bash', ['-c', hook], {
    encoding: 'utf8',
    input: '{"tool_input":{}}',
  });
  assert.equal(status, 0);
});
