// node --test skills/qoq/scripts/estimate.node-test.mjs
//
// The contract is the exit code `plan` branches on and the counts that produce
// it, so the tests drive the script as a subprocess against a throwaway project
// directory — the store lives inside it, so nothing here can teach this
// machine's estimator nonsense.
//
// What's worth asserting is everything a reader can't check by eye: that a
// delivered-but-escalated ticket counts as a miss, that the majority boundary
// lands on the side it's meant to, that the tier lanes stay separate, and that
// split beats escalate when nothing delivers the bucket at all.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const SCRIPT = new URL('estimate.mjs', import.meta.url).pathname;

const world = () => {
  const root = mkdtempSync(join(tmpdir(), 'qoq-project-'));

  const run = (...extra) =>
    spawnSync(process.execPath, [SCRIPT, ...extra, '--project', root], { encoding: 'utf8' });

  const estimate = (tier, ...extra) =>
    run('--tags', 'architectural,mechanical', '--stack', 'react', '--size', 'S', '--tier', tier, ...extra); // prettier-ignore

  const record = (tier, outcome, attempts, ...extra) =>
    run(
      '--record',
      '--tags',
      'architectural,mechanical',
      '--stack',
      'react',
      '--tier',
      tier,
      '--outcome',
      outcome,
      '--attempts',
      String(attempts),
      '--attribution',
      'as-estimated',
      ...extra
    );

  // Delivered after `attempts` tries. More than three means it only landed
  // after an escalation, which is this call having rated the tier wrong.
  const landed = (tier, attempts, ...extra) => record(tier, 'success', attempts, ...extra);

  // Never delivered — the ticket ended blocked with nowhere left to escalate.
  const blocked = (tier, ...extra) => record(tier, 'failure', 3, ...extra);

  return { root, run, estimate, landed, blocked };
};

const json = (result) => JSON.parse(result.stdout);

test('an unknown bucket returns the baseline pick untouched', () => {
  const result = world().estimate('haiku');

  assert.equal(result.status, 0);
  assert.equal(json(result).verdict, 'baseline');
  assert.equal(json(result).tierChange, null);
});

test('the store lives in the project and the next call reads it back', () => {
  const it = world();

  assert.equal(it.landed('haiku', 1).status, 0);
  assert.ok(existsSync(join(it.root, '.claude', 'qoq-estimator.json')));
  assert.equal(json(it.estimate('haiku')).attempts, 1);
});

test('two outcomes is still too little to say — the third opens the verdict', () => {
  const it = world();

  it.landed('haiku', 4);
  it.landed('haiku', 4);

  assert.equal(json(it.estimate('haiku')).verdict, 'baseline');

  it.landed('haiku', 4);

  assert.equal(json(it.estimate('haiku')).verdict, 'escalate');
});

test('a tier that keeps missing moves the pick one rung up', () => {
  const it = world();

  it.landed('haiku', 4);
  it.landed('haiku', 4);
  it.landed('haiku', 1);

  const result = it.estimate('haiku');

  assert.equal(result.status, 1);
  assert.equal(json(result).verdict, 'escalate');
  assert.equal(json(result).tier, 'sonnet');
  assert.equal(json(result).tierChange, 'haiku→sonnet');
});

test('landing inside the three-attempt budget is not a miss', () => {
  const it = world();

  it.landed('sonnet', 1);
  it.landed('sonnet', 2);
  it.landed('sonnet', 3);

  const result = it.estimate('sonnet');

  assert.equal(result.status, 0);
  assert.equal(json(result).verdict, 'confident');
  assert.equal(json(result).misses, 0);
});

test('a delivered ticket that needed an escalation still counts as a miss', () => {
  const it = world();

  it.landed('haiku', 4);

  assert.equal(json(it.estimate('haiku')).misses, 1);
});

test('exactly half missing is not a majority — the pick stands', () => {
  const it = world();

  it.landed('haiku', 4);
  it.landed('haiku', 4);
  it.landed('haiku', 1);
  it.landed('haiku', 1);

  const result = it.estimate('haiku');

  assert.equal(result.status, 0);
  assert.equal(json(result).verdict, 'confident');
});

test('the tier lanes stay separate', () => {
  const it = world();

  it.landed('haiku', 4);
  it.landed('haiku', 4);
  it.landed('haiku', 4);

  // The same bucket, one rung up: haiku's record says nothing about sonnet.
  const result = it.estimate('sonnet');

  assert.equal(result.status, 0);
  assert.equal(json(result).verdict, 'baseline');
  assert.equal(json(result).attempts, 0);
});

test('a bucket nothing delivers is a split, whatever tier is asked about', () => {
  const it = world();

  it.blocked('haiku');
  it.blocked('sonnet');
  it.blocked('session');

  for (const tier of ['haiku', 'sonnet', 'session']) {
    const result = it.estimate(tier);

    assert.equal(result.status, 2);
    assert.equal(json(result).verdict, 'split');
    // Split is about the ticket, not the model, so nothing is escalated.
    assert.equal(json(result).tierChange, null);
  }
});

test('split beats escalate — a bigger model fixes nothing here', () => {
  const it = world();

  it.blocked('haiku');
  it.blocked('haiku');
  it.blocked('haiku');

  assert.equal(it.estimate('haiku').status, 2);
});

test('retries that eventually landed are an escalate, never a split', () => {
  const it = world();

  it.landed('haiku', 4);
  it.landed('haiku', 4);
  it.landed('haiku', 4);

  const result = it.estimate('haiku');

  assert.equal(result.status, 1);
  assert.equal(json(result).undelivered, 0);
});

test('the top rung has nowhere to go but still reports the miss', () => {
  const it = world();

  it.landed('session', 4);
  it.landed('session', 4);
  it.landed('session', 4);

  const result = it.estimate('session');

  assert.equal(result.status, 1);
  assert.equal(json(result).tier, 'session');
  assert.equal(json(result).tierChange, null);
});

test('scope expansion is counted but never reaches a verdict', () => {
  const it = world();

  for (let index = 0; index < 5; index += 1) {
    it.run(
      '--record',
      '--tags',
      'architectural,mechanical',
      '--stack',
      'react',
      '--tier',
      'haiku',
      '--outcome',
      'failure',
      '--attempts',
      '3',
      '--attribution',
      'scope-expansion'
    );
  }

  const result = it.estimate('haiku');

  assert.equal(result.status, 0);
  assert.equal(json(result).verdict, 'baseline');
  assert.equal(json(result).scopeExpansions, 5);
});

test('tag order and case do not scatter one bucket into several', () => {
  const it = world();

  it.landed('haiku', 4);

  const result = it.run(
    '--tags',
    'Mechanical, architectural',
    '--stack',
    'React',
    '--size',
    'S',
    '--tier',
    'haiku'
  );

  assert.equal(json(result).attempts, 1);
});

test('only misses are logged, and the log carries the summary', () => {
  const it = world();

  it.landed('haiku', 1, '--summary', 'landed clean');
  it.blocked('haiku', '--summary', 'the blocker');

  const { recentMisses } = json(it.estimate('haiku'));

  assert.equal(recentMisses.length, 1);
  assert.equal(recentMisses[0].summary, 'the blocker');
});

test('a corrupt store stops the run rather than resetting every bucket', () => {
  const it = world();

  it.landed('haiku', 1);
  writeFileSync(join(it.root, '.claude', 'qoq-estimator.json'), 'not json');

  const result = it.estimate('haiku');

  assert.equal(result.status, 4);
  assert.match(result.stderr, /unreadable calibration file/);
});

test('a missing or unknown tier is a usage error, not a guess', () => {
  const it = world();

  assert.equal(it.run('--tags', 'a', '--stack', 'react', '--size', 'S').status, 4);
  assert.equal(it.estimate('opus').status, 4);
  assert.equal(it.run('--tags', 'a', '--stack', 'react', '--tier', 'haiku').status, 4);
});
