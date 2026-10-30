// node --test skills/qoq/scripts/summarize.node-test.mjs
//
// The contract is what reaches the digest, so the test drives the script the way
// qoq-checker does: as a subprocess over a report dir, reading stdout.
//
// It exists because of one bug: knip emits unused files per-issue in the array
// shape, the summarizer read them only from the top-level `files` key, and every
// unused file was dropped silently. A digest that omits a finding is worse than
// one that never ran — the caller reads PASS and nothing says otherwise.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const SCRIPT = new URL('summarize.mjs', import.meta.url).pathname;

const digestOf = (reports) => {
  const dir = mkdtempSync(join(tmpdir(), 'summarize-'));
  for (const [name, body] of Object.entries(reports)) {
    writeFileSync(join(dir, name), JSON.stringify(body));
  }
  return spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' }).stdout;
};

// The shape knip actually emitted here: one issue object carrying its own `files`.
test('reports unused files from the per-issue array shape', () => {
  const out = digestOf({
    'knip-report.json': {
      issues: [{ file: 'scripts/oracle.js', files: [{ name: 'scripts/oracle.js' }] }],
    },
  });
  assert.match(out, /KNIP/);
  assert.match(out, /unused files/);
  assert.match(out, /scripts\/oracle\.js/);
});

// The other shape the summarizer claims to normalize. Both must reach the digest.
test('reports unused files from the flat top-level shape', () => {
  const out = digestOf({ 'knip-report.json': { files: ['scripts/oracle.js'], issues: {} } });
  assert.match(out, /unused files/);
  assert.match(out, /scripts\/oracle\.js/);
});

// The guard against the failure being invisible: no findings must not look like
// findings, or the test above would pass on a summarizer that prints everything.
test('says nothing about knip when knip found nothing', () => {
  const out = digestOf({ 'knip-report.json': { issues: [] } });
  assert.doesNotMatch(out, /unused files/);
});

// @ladamczyk/outdated's schema v1 lists ok packages too; they must not reach the
// digest, and the flags the old npm-outdated buckets never carried must.
test('reports outdated, deprecated, stale and blocked packages, skipping ok ones', () => {
  const pkg = (name, flags, extra = {}) => ({
    name,
    flags,
    current: '1.0.0',
    latest: '2.0.0',
    ...extra,
  });
  const out = digestOf({
    'npm-report.json': {
      schemaVersion: 1,
      packages: [
        pkg('fine', ['ok']),
        pkg('big', ['outdated'], { majorBump: true }),
        pkg('small', ['outdated'], { majorBump: false, latest: '1.1.0' }),
        pkg('old', ['deprecated', 'stale'], {
          deprecated: 'use new',
          lastPublish: '2020-01-02T00:00:00Z',
        }),
        pkg('held', ['blocked'], { latestNode: '>=26' }),
      ],
    },
  });
  assert.match(out, /NPM {2}3 package\(s\)/);
  assert.match(out, /major\s+x1\s+big 1\.0\.0->2\.0\.0/);
  assert.match(out, /minor\/patch\s+x1\s+small 1\.0\.0->1\.1\.0/);
  assert.match(out, /deprecated\s+x1\s+old: use new/);
  assert.match(out, /stale\s+x1\s+old \(last release 2020-01-02\)/);
  assert.match(out, /blocked\s+x1\s+held \(latest needs node >=26\)/);
  assert.doesNotMatch(out, /fine/);
});

test('says nothing about npm when every package is ok', () => {
  const out = digestOf({
    'npm-report.json': { schemaVersion: 1, packages: [{ name: 'fine', flags: ['ok'] }] },
  });
  assert.doesNotMatch(out, /NPM/);
});

const violation = (path, line, rule, severity) => ({
  path,
  line,
  column: 1,
  directive: 'eslint-disable-next-line',
  tool: 'eslint',
  rule,
  severity,
  message: 'm',
});

const SAMPLE = {
  passed: false,
  scanned: 3,
  violations: [
    violation('src/a.ts', 3, 'missingReason', 'error'),
    violation('src/b.ts', 7, 'missingReason', 'warn'),
    violation('src/c.ts', 1, 'expired', 'error'),
  ],
};

test('groups justify-disable violations by rule, most frequent first, and counts each as a finding', () => {
  const out = digestOf({ 'justify-disable-report.json': SAMPLE });
  assert.match(out, /JUSTIFY-DISABLE {2}3 violation\(s\) \/ 2 rule\(s\) {2}\(2 error, 1 warn\)/);
  assert.match(out, /missingReason\s+x2\s+err\+warn\s+src\/a\.ts:3, src\/b\.ts:7/);
  assert.ok(out.indexOf('missingReason') < out.indexOf('expired'));
  assert.match(out, /TOTAL: 3 finding\(s\)/);
});

test('says nothing about justify-disable when it found nothing', () => {
  const out = digestOf({
    'justify-disable-report.json': { passed: true, scanned: 4, violations: [] },
  });
  assert.doesNotMatch(out, /JUSTIFY-DISABLE/);
  assert.doesNotMatch(out, /TOTAL/);
});

test('flags an unparsable justify-disable report instead of dropping it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'summarize-'));
  writeFileSync(join(dir, 'justify-disable-report.json'), '{not json');
  const out = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' }).stdout;
  assert.match(out, /JUSTIFY-DISABLE {2}⚠ could not parse report: /);
});
