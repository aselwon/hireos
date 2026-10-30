// node --test skills/qoq/scripts/sync-agents.node-test.mjs
//
// The contract is the line on stdout plus what ends up in .claude/agents, so
// the test drives the script as a subprocess and then looks at the directory.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const SCRIPT = new URL('sync-agents.mjs', import.meta.url).pathname;
const SOURCE = new URL('../agents/', import.meta.url).pathname;

const run = (project) => {
  const { status, stdout } = spawnSync(process.execPath, [SCRIPT, '--project', project], {
    encoding: 'utf8',
  });
  return { status, stdout: stdout.trim() };
};

const project = () => mkdtempSync(join(tmpdir(), 'sync-agents-'));
const agentsIn = (dir) =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort();

test("a project with no agents gets every one of the skill's, then reports nothing to do", () => {
  const dir = project();

  const first = run(dir);
  assert.equal(first.status, 0);
  assert.match(first.stdout, /^agents installed: .*registered a moment later$/m);
  // The fallback procedure rides on the `installed` line: it is only actionable
  // on the run that installs, so SKILL.md doesn't carry it on every other one.
  assert.match(first.stdout, /dispatch any of them as `general-purpose`/);
  assert.deepEqual(agentsIn(join(dir, '.claude', 'agents')), agentsIn(SOURCE));

  // Idempotent, because this runs at the tail of every discovery.
  assert.deepEqual(run(dir), { status: 0, stdout: 'agents current' });
});

// An install predating the manifest is every existing project's first run after
// the upgrade that shipped it. Protecting those would freeze them all on the
// bodies they already had.
test('a copy left over from an older skill version is refreshed', () => {
  const dir = project();
  const [agent] = agentsIn(SOURCE);
  mkdirSync(join(dir, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'agents', agent), 'stale\n');

  assert.match(run(dir).stdout, new RegExp(agent.replace('.md', '')));
  assert.equal(
    readFileSync(join(dir, '.claude', 'agents', agent), 'utf8'),
    readFileSync(join(SOURCE, agent), 'utf8')
  );
});

// This writes into the user's own repo, usually into a tracked directory.
// Reverting somebody's customisation on a routine run is the one thing it must
// never do, so once a file is tracked, a body that isn't the one we wrote is
// theirs.
test('an agent edited after being installed is kept, not overwritten', () => {
  const dir = project();
  const [agent] = agentsIn(SOURCE);
  run(dir);

  const edited = `${readFileSync(join(SOURCE, agent), 'utf8')}\n<!-- local tweak -->\n`;
  writeFileSync(join(dir, '.claude', 'agents', agent), edited);

  const { stdout } = run(dir);
  assert.match(stdout, new RegExp(`agents kept \\(edited here[^\\n]*${agent.replace('.md', '')}`));
  assert.equal(readFileSync(join(dir, '.claude', 'agents', agent), 'utf8'), edited);

  // And it stays kept — a report every run, never a one-time notice that scrolls
  // past and then silently reverts on the next one.
  assert.match(run(dir).stdout, /agents kept \(edited here/);
});

// A checkout that symlinks the agents is working on them; a copy would freeze
// the next edit out of every dispatch.
test('a symlinked agent is left as a symlink', () => {
  const dir = project();
  const [agent] = agentsIn(SOURCE);
  mkdirSync(join(dir, '.claude', 'agents'), { recursive: true });
  symlinkSync(join(SOURCE, agent), join(dir, '.claude', 'agents', agent));

  const { stdout } = run(dir);
  assert.ok(lstatSync(join(dir, '.claude', 'agents', agent)).isSymbolicLink());
  assert.doesNotMatch(stdout, new RegExp(`\\b${agent.replace('.md', '')}\\b`));
});

// An agent the skill drops stays registered and dispatchable otherwise, with a
// contract that exists nowhere any more.
test('an agent the skill no longer ships is removed', () => {
  const dir = project();
  run(dir);

  const gone = join(dir, '.claude', 'agents', 'qoq-retired.md');
  const manifestPath = join(dir, '.claude', 'agents', '.qoq-agents.json');
  const body = '---\nname: qoq-retired\n---\n';
  writeFileSync(gone, body);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest['qoq-retired.md'] = createHash('sha256').update(body).digest('hex').slice(0, 16);
  writeFileSync(manifestPath, JSON.stringify(manifest));

  const { stdout } = run(dir);

  assert.match(stdout, /agents removed: qoq-retired/);
  assert.ok(!existsSync(gone));
  assert.ok(!('qoq-retired.md' in JSON.parse(readFileSync(manifestPath, 'utf8'))));
});

// Same proof as everywhere else here: a body that isn't the one we wrote is the
// user's, and deleting it would be the one thing this script must never do.
test('an edited copy of a dropped agent is kept, not deleted', () => {
  const dir = project();
  run(dir);

  const gone = join(dir, '.claude', 'agents', 'qoq-retired.md');
  const manifestPath = join(dir, '.claude', 'agents', '.qoq-agents.json');
  writeFileSync(gone, '---\nname: qoq-retired\n---\nedited by hand\n');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest['qoq-retired.md'] = 'notthedigest00';
  writeFileSync(manifestPath, JSON.stringify(manifest));

  const { stdout } = run(dir);

  assert.match(stdout, /agents kept \(edited here[^\n]*qoq-retired/);
  assert.ok(existsSync(gone));
});

// A checkout that symlinks its agents never appears in the manifest, so the
// removal above can't see it — and a link with nothing behind it is a file
// Claude Code still tries to parse as an agent.
test('a symlink to a dropped agent is removed', () => {
  const dir = project();
  run(dir);

  const dangling = join(dir, '.claude', 'agents', 'qoq-retired.md');
  symlinkSync(join(SOURCE, 'qoq-retired.md'), dangling);

  const { stdout } = run(dir);

  assert.match(stdout, /agents removed: qoq-retired/);
  assert.ok(!lstatSync(dangling, { throwIfNoEntry: false }));
});

test('an unknown flag is a usage error', () => {
  assert.equal(run(project()).status, 0);
  const { status } = spawnSync(process.execPath, [SCRIPT, '--force'], { encoding: 'utf8' });
  assert.equal(status, 2);
});
