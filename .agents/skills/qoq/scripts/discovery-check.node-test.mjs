// node --test skills/qoq/scripts/discovery-check.node-test.mjs
//
// The contract is the exit code plus stdout, so the test drives the script the
// way the skill does: as a subprocess, reading only what a caller reads.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const SCRIPT = new URL('discovery-check.mjs', import.meta.url).pathname;
const RECORD_DIR = ['node_modules', '@ladamczyk', 'qoq-cli', 'bin'];

const run = (project) => {
  const { status, stdout } = spawnSync(process.execPath, [SCRIPT, '--project', project], {
    encoding: 'utf8',
  });
  return { status, stdout: stdout.trim() };
};

// Everything below drives the stale path, which now stops the run outright when
// the CLI is absent — so every fixture has it installed.
const hashOf = (project) => JSON.parse(run(project).stdout).hash;

const fixture = ({ lock = '{"v":1}', manifest = '{"scripts":{"test":"vitest"}}', record } = {}) => {
  const project = mkdtempSync(join(tmpdir(), 'discovery-check-'));
  writeFileSync(join(project, 'package.json'), manifest);
  writeFileSync(join(project, 'package-lock.json'), lock);
  mkdirSync(join(project, 'node_modules', '@ladamczyk', 'qoq-cli'), { recursive: true });
  if (record !== undefined) {
    mkdirSync(join(project, ...RECORD_DIR), { recursive: true });
    writeFileSync(join(project, ...RECORD_DIR, 'qoq-skill-discovery.json'), record);
  }
  return project;
};

// The hash the script reports when it says re-discover is the one a fresh
// record must carry, so writing it back has to satisfy the next run.
test('a record carrying the current hash is used, not re-derived', () => {
  const project = fixture();
  const { status, stdout } = run(project);
  assert.equal(status, 1);

  const record = JSON.stringify({ hash: JSON.parse(stdout).hash, test: 'npm test' });
  const { status: second, stdout: contents } = run(fixture({ record }));
  assert.equal(second, 0);
  assert.equal(JSON.parse(contents).test, 'npm test');
});

// The tree the record's runner/react/CLI answers were derived from moved.
test('a watched dependency appearing in the lockfile makes the record stale', () => {
  const hash = hashOf(fixture());
  const project = fixture({
    lock: '{"packages":{"node_modules/@testing-library/react":{}}}',
    record: JSON.stringify({ hash }),
  });
  assert.equal(run(project).status, 1);
});

// The reason the whole file isn't hashed: a lockfile moves whenever any
// transitive dependency does, and none of those change a word of the record.
test('an unrelated lockfile change is not staleness', () => {
  const hash = hashOf(fixture());
  const project = fixture({
    lock: '{"packages":{"node_modules/left-pad":{"version":"1.3.0"}}}',
    record: JSON.stringify({ hash }),
  });
  assert.equal(run(project).status, 0);
});

// Same reason, on the manifest side: semantic-release bumps `version` on every
// release commit, and the record has no stake in it.
test('a version bump in package.json is not staleness', () => {
  const hash = hashOf(fixture());
  const project = fixture({
    manifest: '{"version":"2.0.0","scripts":{"test":"vitest"}}',
    record: JSON.stringify({ hash }),
  });
  assert.equal(run(project).status, 0);
});

test('a reordered scripts block is not staleness', () => {
  const hash = hashOf(fixture({ manifest: '{"scripts":{"a":"x","b":"y"}}' }));
  const project = fixture({
    manifest: '{"scripts":{"b":"y","a":"x"}}',
    record: JSON.stringify({ hash }),
  });
  assert.equal(run(project).status, 0);
});

// The case the lockfile alone would miss: renaming a script leaves the tree
// untouched, and every command field on the record quotes those scripts.
test('a renamed package.json script makes the record stale', () => {
  const hash = hashOf(fixture());
  const project = fixture({
    manifest: '{"scripts":{"test:ci":"vitest"}}',
    record: JSON.stringify({ hash }),
  });
  assert.equal(run(project).status, 1);
});

test('a missing record asks for a fresh one', () => {
  assert.equal(run(fixture()).status, 1);
});

// The half the agent no longer derives. Everything here is reading rather than
// judgement, and doing it twice — once here to hash, once in the agent — is how
// the two answers come to disagree.
test('the stale payload proposes the mechanical fields', () => {
  const manifest = JSON.stringify({
    scripts: { test: 'vitest', build: 'tsc' },
    devDependencies: { vitest: '^3.0.0', '@testing-library/react': '^16.0.0' },
  });
  const { proposed } = JSON.parse(run(fixture({ manifest })).stdout);

  assert.equal(proposed.test, 'npm test');
  assert.equal(proposed.build, 'npm run build');
  assert.equal(proposed.runner, 'vitest');
  assert.equal(proposed.react, true);
  // vitest ships globals off; jest ships them on. The absence of the key means
  // opposite things, and a wrong answer writes specs that cannot execute.
  assert.equal(proposed.globals, false);
  // Never null, never "" — both read as "there is one" to a presence check.
  assert.ok(!('conventions' in proposed));
});

test('a runner it cannot name leaves runner and globals to the agent', () => {
  const manifest = JSON.stringify({ scripts: { test: 'node --test' } });
  const { proposed, unresolved } = JSON.parse(run(fixture({ manifest })).stdout);

  assert.ok(unresolved.includes('runner'));
  assert.ok(unresolved.includes('globals'));
  assert.ok(!('runner' in proposed));
});

// The one field that stays the agent's every time: both runners take a path
// positionally, so a default is easy to write and easy to be wrong about.
test('test:one is always left unresolved', () => {
  assert.ok(JSON.parse(run(fixture()).stdout).unresolved.includes('test:one'));
});

test('a build with no script is asked about, never invented from a dependency', () => {
  const manifest = JSON.stringify({ scripts: { test: 'vitest' } });
  const { proposed, unresolved } = JSON.parse(run(fixture({ manifest })).stdout);

  assert.ok(unresolved.includes('build'));
  assert.ok(!('build' in proposed));
});

// How the CLI is invoked is a constant, not a discovered field, so a project
// without it discovers exactly what any other project does. Nothing here watches
// that package, and nothing proposes a `run` or a `check`.
test('the CLI is neither watched nor proposed', () => {
  const project = mkdtempSync(join(tmpdir(), 'discovery-check-'));
  writeFileSync(join(project, 'package.json'), '{"scripts":{"test":"vitest"}}');

  const { status, stdout } = run(project);
  const { proposed, unresolved } = JSON.parse(stdout);

  assert.equal(status, 1);
  assert.ok(!('run' in proposed));
  assert.ok(!('check' in proposed));
  assert.ok(!unresolved.includes('check'));
});

test('an unparsable record is treated as missing rather than half-read', () => {
  assert.equal(run(fixture({ record: '{ truncated' })).status, 1);
});

// The skill's agents are sync-agents.mjs's business, not the hash's: a skill
// upgrade that ships a changed agent refreshes the project's copies for a few
// file reads, and dispatching a whole discovery run to re-confirm project
// answers nobody touched is the cost this gate exists to avoid. The fixture is a
// copy of the script with its own agents/ beside it, which is where it would
// look if it still cared.
test('a changed agent file in the skill is not staleness', () => {
  const skill = mkdtempSync(join(tmpdir(), 'discovery-check-skill-'));
  mkdirSync(join(skill, 'scripts'));
  mkdirSync(join(skill, 'agents'));
  copyFileSync(SCRIPT, join(skill, 'scripts', 'discovery-check.mjs'));
  writeFileSync(join(skill, 'agents', 'qoq-checker.md'), 'first version\n');

  const project = fixture();
  const script = join(skill, 'scripts', 'discovery-check.mjs');
  const hashWith = () =>
    spawnSync(process.execPath, [script, '--project', project], { encoding: 'utf8' }).stdout.trim();

  const before = hashWith();
  writeFileSync(join(skill, 'agents', 'qoq-checker.md'), 'second version\n');

  assert.equal(hashWith(), before);
});
