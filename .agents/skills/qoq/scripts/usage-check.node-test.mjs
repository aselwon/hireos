// node --test skills/qoq/scripts/usage-check.node-test.mjs
//
// The two halves are tested the way they're used: the pure functions directly,
// and the flag parsing through a subprocess, since exit 2 is the contract for a
// bad limit. The fetch isn't tested — it's one call to one endpoint, and a test
// that mocks it only proves the mock.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { parseLimit, verdict } from './usage-check.mjs';

const SCRIPT = new URL('usage-check.mjs', import.meta.url).pathname;
const usage = (session, week) => ({
  five_hour: { utilization: session },
  seven_day: { utilization: week },
});

test('a missing limit defaults to 100', () => {
  assert.equal(parseLimit('session-limit', undefined), 100);
});

test('0 is a real limit, not a missing one', () => {
  assert.equal(parseLimit('session-limit', '0'), 0);
});

test('a limit outside 0-100 or not a number is rejected', () => {
  for (const bad of ['101', '-1', '90abc', '', 'all']) {
    assert.throws(() => parseLimit('weekly-limit', bad), /between 0 and 100/);
  }
});

test('under both limits proceeds and reports headroom', () => {
  const { ok, lines } = verdict(usage(10, 20), { sessionLimit: 80, weeklyLimit: 90 });
  assert.equal(ok, true);
  assert.match(lines[0], /session \(5h\): 10% used of 80% allowed — 70% headroom/);
  assert.match(lines[1], /70% headroom/);
});

test('at the limit counts as reached, and names which window', () => {
  const { ok, lines } = verdict(usage(80, 20), { sessionLimit: 80, weeklyLimit: 90 });
  assert.equal(ok, false);
  assert.match(lines.at(-1), /LIMIT REACHED: session \(5h\)$/);
});

test('both windows over are both named', () => {
  const { lines } = verdict(usage(99, 95), { sessionLimit: 80, weeklyLimit: 90 });
  assert.match(lines.at(-1), /session \(5h\), weekly \(7d\)/);
});

test('headroom never goes negative', () => {
  const { lines } = verdict(usage(95, 0), { sessionLimit: 80, weeklyLimit: 100 });
  assert.match(lines[0], /0% headroom/);
});

test('a bad limit exits 2 before any network call', () => {
  const run = spawnSync(process.execPath, [SCRIPT, '--session-limit', 'lots'], {
    encoding: 'utf8',
  });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /--session-limit must be a percentage/);
});

// `.claude/skills/qoq` is a symlink, and argv[1] arrives unresolved through it.
// The guard once compared it raw, so the gate exited 0 having checked nothing.
test('runs when invoked through a symlinked skill directory', () => {
  const link = join(mkdtempSync(join(tmpdir(), 'qoq-usage-')), 'scripts');
  symlinkSync(dirname(SCRIPT), link);
  const run = spawnSync(
    process.execPath,
    [join(link, 'usage-check.mjs'), '--session-limit', 'lots'],
    {
      encoding: 'utf8',
    }
  );
  assert.equal(run.status, 2);
});
