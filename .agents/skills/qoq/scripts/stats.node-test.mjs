// node --test skills/qoq/scripts/stats.node-test.mjs
//
// The contract is the exit code the skill branches on plus what gets written, so
// the test drives the script as a subprocess with HOME pointed at a throwaway.
//
// Every case here resolves to `declined` or `ask`, which is deliberate: the
// endpoint is a constant, so a case that resolved to `sent` would post real
// traffic to the real stats server every time the suite runs. The send itself is
// six lines lifted from the CLI's `src/helpers/stats.ts`, which has its own
// spec — the part that is new here, and the part where a bug is silent, is
// deciding whether to call it at all.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const SCRIPT = new URL('stats.mjs', import.meta.url).pathname;

const project = (configSource) => {
  const root = mkdtempSync(join(tmpdir(), 'qoq-stats-'));

  if (configSource !== undefined) {
    writeFileSync(join(root, 'qoq.config.js'), configSource);
  }

  return root;
};

const run = (root, home, ...args) =>
  spawnSync(process.execPath, [SCRIPT, ...args, '--project', root], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home },
  });

const home = () => mkdtempSync(join(tmpdir(), 'qoq-home-'));

const NO_STATS = "export default { prettier: { sources: ['.'] } };\n";

test('no config and no lockfile exits 1 so the caller asks', () => {
  assert.equal(run(project(), home(), 'fix').status, 1);
});

test('a config with no stats key still exits 1 — absent is not a decline', () => {
  assert.equal(run(project(NO_STATS), home(), 'fix').status, 1);
});

// The allowlist is hardcoded in both scripts, so a command added to one and not
// the other exits 2 on a usage error the caller has no way to interpret.
test('replan is an accepted command, not a usage error', () => {
  const { status, stdout } = run(project(), home(), 'replan');

  assert.notEqual(status, 2);
  assert.ok(stdout.includes(JSON.stringify({ tool: 'qoq-skill', options: ['replan'] })));
});

// The disclosure quotes the request body rather than describing it, so it cannot
// come to promise less than what is sent. That only holds while it is generated
// from the same object, which is what this asserts.
test('the ask quotes the literal payload for the command that ran', () => {
  const { stdout } = run(project(), home(), 'bump');

  assert.match(stdout, /^ask: no consent on record$/m);
  assert.ok(stdout.includes(JSON.stringify({ tool: 'qoq-skill', options: ['bump'] })));
  assert.ok(stdout.includes('https://stats.adamczyk.ovh'));
  // Both endpoints are disclosed, because a run counts through either one.
  assert.ok(
    stdout.includes('https://adamczyk.ovh/img/stats/pixel.png?tool=qoq-skill&options=bump')
  );
});

test('stats: false in the project config resolves to declined without asking', () => {
  const config = "export default { stats: false, prettier: { sources: ['.'] } };\n";
  const result = run(project(config), home(), 'fix');

  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'declined\n');
});

test('--consent no records the answer in the config the CLI also reads', () => {
  const root = project(NO_STATS);
  const result = run(root, home(), 'bump', '--consent', 'no');

  assert.equal(result.status, 0);
  assert.match(readFileSync(join(root, 'qoq.config.js'), 'utf8'), /stats: false/);
});

test('a recorded decline is then read back instead of asking again', () => {
  const root = project(NO_STATS);
  const dir = home();

  run(root, dir, 'bump', '--consent', 'no');

  assert.equal(run(root, dir, 'refactor').status, 0);
});

test('with no config to write, the answer falls back to the home lockfile', () => {
  const root = project();
  const dir = home();

  assert.equal(run(root, dir, 'test', '--consent', 'no').status, 0);
  assert.match(readFileSync(join(dir, '.claude', 'qoq', 'consent.md'), 'utf8'), /stats: false/);

  // The point of the lockfile: the next run in a config-less project reads it
  // rather than asking the user a second time.
  assert.equal(run(root, dir, 'test').status, 0);
});

test('a config whose export is not an inline object falls back rather than mangling it', () => {
  const root = project('const config = { prettier: {} };\nexport default config;\n');
  const dir = home();

  assert.equal(run(root, dir, 'fix', '--consent', 'no').status, 0);
  assert.equal(readFileSync(join(root, 'qoq.config.js'), 'utf8').includes('stats'), false);
  assert.match(readFileSync(join(dir, '.claude', 'qoq', 'consent.md'), 'utf8'), /stats: false/);
});

test('an unknown command is a usage error, not a silent send', () => {
  assert.equal(run(project(NO_STATS), home(), 'deploy').status, 2);
});
