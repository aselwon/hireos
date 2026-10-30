// node --test skills/qoq/scripts/entry.node-test.mjs
//
// The contract is the exit code plus the sections on stdout, so the test drives
// the script as a subprocess. It composes three children that have their own
// specs — what is asserted here is only the sequencing this file owns.
//
// HOME points at a throwaway with stats declined, so no case reaches the real
// endpoint. The one thing that must never happen is a second send per run.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const SCRIPT = new URL('entry.mjs', import.meta.url).pathname;

const DECLINED = "export default { stats: false, prettier: { sources: ['.'] } };\n";

const fixture = ({ cli = true } = {}) => {
  const project = mkdtempSync(join(tmpdir(), 'qoq-entry-'));
  writeFileSync(join(project, 'package.json'), '{"scripts":{"test":"vitest","build":"tsc"}}');
  writeFileSync(join(project, 'qoq.config.js'), DECLINED);
  if (cli) {
    mkdirSync(join(project, 'node_modules', '@ladamczyk', 'qoq-cli'), { recursive: true });
  }
  return project;
};

// A tier mapping exported in the developer's shell would add a `models` section
// to every run, so those variables never reach the child.
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !/^ANTHROPIC_DEFAULT_\w+_MODEL$/.test(key))
);

const run = (project, command, home = mkdtempSync(join(tmpdir(), 'qoq-entry-home-'))) =>
  spawnSync(process.execPath, [SCRIPT, '--project', project, '--command', command], {
    encoding: 'utf8',
    env: { ...cleanEnv, HOME: home },
  });

test('a run reports all three checks', () => {
  const { status, stdout } = run(fixture(), 'fix');

  assert.equal(status, 0);
  assert.match(stdout, /^## agents$/m);
  assert.match(stdout, /^## discovery$/m);
  assert.match(stdout, /^## stats$/m);
});

// The record is the whole point of the check; a caller that has to go and read
// the file itself is paying for the gate twice.
test('a stale record hands the payload to the caller', () => {
  const { stdout } = run(fixture(), 'fix');

  assert.match(stdout, /stale —/);
  assert.match(stdout, /fill the record in yourself/);
  assert.ok(stdout.includes('"proposed"'));
  assert.ok(stdout.includes('"unresolved"'));
});

// `compress` edits prose, runs no tool and dispatches no agent, so nothing on
// the record bears on it.
test('compress and review skip discovery', () => {
  for (const command of ['compress', 'review']) {
    const { status, stdout } = run(fixture(), command);

    assert.equal(status, 0);
    assert.match(stdout, /## discovery\nskipped/);
    const [, afterHeading] = stdout.split('## discovery');
    const [discovery] = afterHeading.split('##');
    assert.doesNotMatch(discovery, /fill the record/);
  }
});

// The rule that had drifted across three prose files. These three dispatch a
// pinned agent inside the window before Claude Code registers the directory.
test('a fresh install is a question for fix, test, execute, document, sheriff and review', () => {
  for (const command of ['fix', 'test', 'execute', 'document', 'sheriff', 'review']) {
    assert.match(run(fixture(), command).stdout, /ACTION: ask the user before carrying on/);
  }
});

// The deliberate exception: refactor opens with a fix, so its first checker does
// land in the window — and a question in front of a command whose next move is
// another command's question is noise.
test('refactor and the rest only report the install at the end', () => {
  for (const command of ['refactor', 'bump', 'plan', 'replan', 'compress']) {
    const { stdout } = run(fixture(), command);
    assert.match(stdout, /agents installed:/);
    assert.doesNotMatch(stdout, /ACTION: ask the user before carrying on/);
  }
});

// `replan` decomposes, so it reads the record for the same reasons `plan` does.
// It is the one thing that would have made it plausible to skip discovery.
test('replan reads the record like plan does', () => {
  const { status, stdout } = run(fixture(), 'replan');

  assert.equal(status, 0);
  assert.doesNotMatch(stdout, /## discovery\nskipped/);
});

// Zero config is zero noise: the section exists only to carry a cost warning.
test('models is silent unless a tier is mapped to a dearer family', () => {
  assert.doesNotMatch(run(fixture(), 'fix').stdout, /^## models$/m);

  const home = mkdtempSync(join(tmpdir(), 'qoq-entry-home-'));
  mkdirSync(join(home, '.claude'));
  writeFileSync(
    join(home, '.claude', 'settings.json'),
    JSON.stringify({ env: { ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-opus-5-5' } })
  );
  const { stdout } = run(fixture(), 'fix', home);

  assert.match(stdout, /^## models\nWARN: haiku → claude-opus-5-5 \(opus\)/m);
  assert.match(stdout, /ACTION: show these lines to the user once/);
});

// The CLI is a constant this skill assumes, not something entry discovers: a
// project without it runs the same three checks as any other.
test('the CLI is not a head-of-run check', () => {
  const { status, stdout } = run(fixture({ cli: false }), 'fix');

  assert.equal(status, 0);
  assert.doesNotMatch(stdout, /STOP:/);
});

// SKILL.md injects this script's output, and a non-zero exit there aborts the
// whole skill invocation — so a missing command is a question, not an error.
test('a missing or unknown command asks, runs nothing, and exits 0', () => {
  for (const command of [[], ['--command', ''], ['--command', 'lint']]) {
    const { status, stdout } = spawnSync(
      process.execPath,
      [SCRIPT, '--project', fixture(), ...command],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(status, 0);
    assert.match(stdout, /^## command$/m);
    assert.match(stdout, /ACTION: ask which command/);
    assert.doesNotMatch(stdout, /^## (agents|discovery|stats)$/m);
  }
});
