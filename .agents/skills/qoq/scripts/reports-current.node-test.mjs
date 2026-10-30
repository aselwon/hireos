// node --test skills/qoq/scripts/reports-current.node-test.mjs
//
// The contract is the exit code, so the test drives the script the way
// qoq-checker does: as a subprocess, reading the code and nothing else.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const SCRIPT = new URL('reports-current.mjs', import.meta.url).pathname;

const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args]).status;

// mtimes are set explicitly — writing files in order is not a reliable clock.
const at = (path, seconds) => utimesSync(path, seconds, seconds);

const fixture = ({ reportAt, sourceAt }) => {
  const root = mkdtempSync(join(tmpdir(), 'reports-current-'));
  const reports = join(root, 'report');
  const src = join(root, 'src');
  mkdirSync(reports);
  mkdirSync(join(src, 'nested'), { recursive: true });

  if (reportAt !== undefined) {
    writeFileSync(join(reports, 'eslint-report.json'), '{}');
    at(join(reports, 'eslint-report.json'), reportAt);
  }
  writeFileSync(join(src, 'nested', 'a.ts'), '');
  at(join(src, 'nested', 'a.ts'), sourceAt);

  return { reports, src };
};

test('reports newer than every source file are current', () => {
  const { reports, src } = fixture({ reportAt: 2000, sourceAt: 1000 });
  assert.equal(run(reports, src), 0);
});

test('a source file touched after the reports is stale', () => {
  const { reports, src } = fixture({ reportAt: 1000, sourceAt: 2000 });
  assert.equal(run(reports, src), 1);
});

test('nested source files count — the walk is recursive', () => {
  const { reports, src } = fixture({ reportAt: 1500, sourceAt: 2000 });
  assert.equal(run(reports, join(src, 'nested')), 1);
});

test('no reports at all is stale, not current', () => {
  const { reports, src } = fixture({ sourceAt: 1000 });
  assert.equal(run(reports, src), 1);
});

test('a missing scope argument is a usage error, not a verdict', () => {
  const { reports } = fixture({ reportAt: 2000, sourceAt: 1000 });
  assert.equal(run(reports), 2);
});

test('a justify-disable report older than the sources makes the set stale', () => {
  const { reports, src } = fixture({ reportAt: 3000, sourceAt: 2000 });
  writeFileSync(join(reports, 'justify-disable-report.json'), '{}');
  at(join(reports, 'justify-disable-report.json'), 1000);
  assert.equal(run(reports, src), 1);
});
