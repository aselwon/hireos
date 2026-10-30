#!/usr/bin/env node
// Is the discovery record still good for this project?
//
// Every qoq command starts from the record. Re-deriving it on every run costs a
// dozen file reads to confirm something nothing has touched, so this is the cheap
// gate in front of that: the record carries a hash of the inputs its answers came
// from, and a matching hash means nothing it describes has moved.
//
// Two inputs, and only the parts of them the record actually reads:
//
//   - package.json's `scripts` block. Every command field on the record quotes
//     one verbatim, and renaming one moves no lockfile at all — the record would
//     keep naming a script that no longer exists.
//   - the handful of dependencies the rest of the fields were read off — the test
//     stack behind `runner` and `react` — by name in package.json's dependencies,
//     by the lines naming them in the project's lockfile.
//
// How the qoq CLI is invoked is deliberately not a field and not an input. It is
// a constant (`npx qoq --check --json`, SKILL.md's CLI section), so there is
// nothing here to go stale and no reason to watch that package.
//
// Deliberately NOT the whole of either file. package.json's `version` moves on
// every release commit, and a lockfile moves whenever any transitive dependency
// does; neither changes a word of the record. Hashing them whole dispatched a
// discovery agent to re-confirm answers nothing had touched, which is the exact
// cost this gate exists to avoid. Versions of the watched packages are out for
// the same reason: `runner` is `vitest` at any version.
//
// A script rather than prose for the caller to carry out, because "has this
// project moved" has to mean one thing. Two callers eyeballing a lockfile will
// disagree, and the failure is silent: a stale record is read as current and
// every command after it runs on answers for a project that's gone.
//
// The skill's own agent files are deliberately NOT in here, though the project's
// copies of them do go stale when the skill upgrades. That's a different
// question with a different answer: scripts/sync-agents.mjs compares them file
// by file on every top-level run and reports its own verdict, so an upgraded
// skill refreshes the copies for the price of a few file reads. Hashing them
// here instead made a skill upgrade look like a moved dependency and dispatched
// a whole discovery agent to re-confirm project answers that hadn't changed —
// and every user gets a skill upgrade.
//
// When the record IS stale, this also derives the fields that are a matter of
// reading rather than judgement — the scripts block, which test stack is
// installed — and hands them over as a proposal. The caller then checks a
// filled-in record and settles what's left, instead of deriving ten fields from
// scratch every time one dependency moved. The mechanical half never needed a
// model at all, and two implementations of it (one here to hash, one in prose to
// derive) is how the two come to disagree.
//
// The derivation runs only after the hash has already failed, so the common
// path — a current record, which is nearly every run — pays none of it.
//
// Usage:   node discovery-check.mjs [--project <dir>]
//   --project   project root (default: cwd)
//
// Exit code: 0 the record is current — its JSON is on stdout, use it and
// dispatch nothing. 1 missing, unreadable, or derived from a different project
// state — stdout is `{ hash, proposed, unresolved }` for the agent's dispatch,
// stderr says which it was. 2 usage error.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RECORD = ['node_modules', '@ladamczyk', 'qoq-cli', 'bin', 'qoq-skill-discovery.json'];

// The project's lockfile, in the order a package manager would win a tie. One
// project has one of these; the first that exists is it. A project with none
// still hashes cleanly — the same dependency names are in package.json.
const LOCKS = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'];

// The dependencies the record's non-script fields are read off: the test stack
// behind `runner` and `react`. Matched as a substring, so a neighbour comes along
// (`@vitest/coverage-v8`, `jest-worker`) — over-matching costs a re-derive that
// finds nothing changed, missing one is the silent failure.
const WATCHED = /@testing-library\/react|vitest|jest/;

const args = process.argv.slice(2);
const projectIndex = args.indexOf('--project');
const project = projectIndex === -1 ? process.cwd() : args[projectIndex + 1];

if (!project || args.some((arg) => arg.startsWith('--') && arg !== '--project')) {
  process.stderr.write('usage: discovery-check.mjs [--project <dir>]\n');
  process.exit(2);
}

const manifestPath = join(project, 'package.json');

if (!existsSync(manifestPath)) {
  process.stderr.write(`no package.json in ${project}\n`);
  process.exit(2);
}

const lockPath = LOCKS.map((name) => join(project, name)).find((path) => existsSync(path));
const manifestText = readFileSync(manifestPath, 'utf8');

let manifest;
try {
  manifest = JSON.parse(manifestText);
} catch {
  process.stderr.write(`${manifestPath} is not valid JSON\n`);
  process.exit(2);
}

const digest = createHash('sha256');

// The replacer array is also the key order, so a reordered scripts block isn't
// mistaken for a renamed script.
const scripts = manifest.scripts ?? {};
digest.update(JSON.stringify(scripts, Object.keys(scripts).sort()));

// package.json is parsed, so the watched names are matched against dependency
// names — not raw lines, which on a minified manifest would drag `version` back
// in through whatever line it shares. Names without ranges: `runner` is `vitest`
// at any version.
const declared = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter(
  (name) => WATCHED.test(name)
);

// A lockfile has no one shape across four package managers, so match whole lines
// naming a watched package. Sorted and de-duplicated: npm and pnpm both reorder
// entries for reasons of their own, and one dependency is named on several
// lines. A project with no lockfile still hashes — `declared` carries it.
const locked = (lockPath ? readFileSync(lockPath, 'utf8').split('\n') : [])
  .filter((line) => WATCHED.test(line))
  .map((line) => line.trim());

digest.update([...new Set([...declared, ...locked])].sort().join('\n'));

const hash = digest.digest('hex').slice(0, 16);

const dependency = (name) =>
  Boolean(manifest.dependencies?.[name] ?? manifest.devDependencies?.[name]);

// Runner config, as text. Which key decides `globals` differs between the two
// runners, and neither file is worth evaluating to read one boolean.
const configText = (names) => {
  const path = names.map((name) => join(project, name)).find((candidate) => existsSync(candidate));
  return path ? readFileSync(path, 'utf8') : undefined;
};

// Opposite defaults: vitest ships globals off, jest ships them on, so the
// absence of the key means different things and the fallback is per runner.
const proposeGlobals = (runner) => {
  const source =
    runner === 'vitest'
      ? configText([
          'vitest.config.ts',
          'vitest.config.js',
          'vitest.config.mjs',
          'vite.config.ts',
          'vite.config.js',
        ])
      : configText(['jest.config.ts', 'jest.config.js', 'jest.config.mjs', 'jest.config.json']);

  if (runner === 'vitest') {
    return source ? /\bglobals\s*:\s*true\b/.test(source) : false;
  }

  return source ? !/\binjectGlobals\s*:\s*false\b/.test(source) : true;
};

// Neither runner, or somehow both, is not a coin to flip: `globals` rides on the
// answer, and getting that wrong writes specs that cannot execute at all.
const proposeRunner = (proposed, unresolved) => {
  const vitest = dependency('vitest');

  if (vitest === dependency('jest')) {
    unresolved.push('runner', 'globals');
    return;
  }

  proposed.runner = vitest ? 'vitest' : 'jest';
  proposed.globals = proposeGlobals(proposed.runner);
};

// The project's own scripts, verbatim. A project with no script for something is
// a project that has to be asked, which is what unresolved means here — never an
// `npx vitest` composed out of a dependency, which skips the project's config
// and setup files and is plausible enough to go unnoticed.
const SCRIPTED = [
  ['test', 'test', 'npm test'],
  ['build', 'build', 'npm run build'],
];

// The fields that are reading, not judgement. Everything genuinely ambiguous is
// named in `unresolved` instead and left to the agent — a plausible guess on any
// of these is worse than a stop, because nothing downstream would notice it.
const propose = () => {
  const scripts = manifest.scripts ?? {};
  const proposed = {};

  // `test:one` is always the agent's: both runners take a path positionally, so
  // a default is easy to write and easy to be wrong about, and a project with a
  // dedicated single-file script wants that one.
  const unresolved = ['test:one'];

  for (const [field, script, invocation] of SCRIPTED) {
    if (scripts[script]) {
      proposed[field] = invocation;
    } else {
      unresolved.push(field);
    }
  }

  proposeRunner(proposed, unresolved);

  proposed.react = dependency('@testing-library/react');

  // Omitted entirely when absent — never null, never "", both of which read as
  // "there is one" to anything checking the key's presence.
  if (existsSync(join(project, 'testing-gate.md'))) {
    proposed.conventions = './testing-gate.md';
  }

  return { hash, proposed, unresolved };
};

const stale = (reason) => {
  process.stderr.write(`${reason}\n`);
  process.stdout.write(`${JSON.stringify(propose(), undefined, 2)}\n`);
  process.exit(1);
};

const recordPath = join(project, ...RECORD);

if (!existsSync(recordPath)) {
  stale('no discovery record');
}

let record;
try {
  record = JSON.parse(readFileSync(recordPath, 'utf8'));
} catch {
  // A record that doesn't parse is worse than none: whoever reads it next will
  // read half of it. Treat it as absent and let discovery overwrite.
  stale('discovery record is not valid JSON');
}

if (record.hash !== hash) {
  stale(
    `a hashed input changed — a package.json script or a watched dependency ` +
      `(record ${record.hash ?? 'unhashed'}, now ${hash})`
  );
}

process.stdout.write(`${JSON.stringify(record, undefined, 2)}\n`);
