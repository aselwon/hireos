#!/usr/bin/env node
// Are the reports in <report-dir> still current for <scope>?
//
// `qoq fix` calls qoq-checker at the top of every loop, and re-running every
// tool each time is the most expensive thing in the system. This is the cheap
// answer: an mtime comparison. Reports are current only when the OLDEST report
// on disk is newer than the NEWEST file in scope — one source file touched
// after one report was written makes the whole set stale.
//
// It's a script rather than a paragraph of prose for the checker to carry out,
// because a wrong answer here is silent: a stale digest read as current makes
// `fix` declare PASS over code nothing checked.
//
// Usage:   node reports-current.mjs <report-dir> <scope...>
//   <report-dir>  where `qoq --check --json` wrote its reports
//   <scope...>    files or directories the verdict is about; a bare `qoq fix`
//                 passes qoq.config's srcPath
//
// Exit code: 0 current (reuse them), 1 stale or missing (re-run the check),
// 2 usage error. Branch on the code; stdout is for humans reading a log.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPORTS = [
  'prettier-report.json',
  'eslint-report.json',
  'knip-report.json',
  'jscpd-report.json',
  'npm-report.json',
  'stylelint-report.json',
  'structurelint-report.json',
  'skillslint-report.json',
  'justify-disable-report.json',
];

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

const [reportDir, ...scope] = process.argv.slice(2);

if (!reportDir || scope.length === 0) {
  process.stderr.write('usage: reports-current.mjs <report-dir> <scope...>\n');
  process.exit(2);
}

// Oldest report wins: one tool that didn't re-run leaves the set stale.
const oldestReport = (dir) => {
  const times = REPORTS.map((name) => join(dir, name))
    .filter(existsSync)
    .map((path) => statSync(path).mtimeMs);
  return times.length ? Math.min(...times) : undefined;
};

const newestSource = (paths) => {
  let newest = 0;
  for (const path of paths) {
    if (!existsSync(path)) {
      continue;
    }
    const stat = statSync(path);
    if (!stat.isDirectory()) {
      newest = Math.max(newest, stat.mtimeMs);
      continue;
    }
    for (const entry of readdirSync(path, { recursive: true, withFileTypes: true })) {
      if (entry.isDirectory() || SKIP.has(entry.name)) {
        continue;
      }
      // parentPath is Node >=20.12; name alone would lose the subdirectory.
      const full = join(entry.parentPath ?? entry.path, entry.name);
      if (full.split('/').some((part) => SKIP.has(part))) {
        continue;
      }
      newest = Math.max(newest, statSync(full).mtimeMs);
    }
  }
  return newest;
};

const reports = oldestReport(reportDir);

if (reports === undefined) {
  process.stdout.write(`stale: no reports in ${reportDir}\n`);
  process.exit(1);
}

const source = newestSource(scope);

if (source >= reports) {
  process.stdout.write('stale: a file in scope is newer than the reports\n');
  process.exit(1);
}

process.stdout.write('current\n');
process.exit(0);
