// node --test skills/qoq/scripts/model-tiers.node-test.mjs
//
// The contract is stdout plus what lands in the settings files, so the test
// drives the script as a subprocess with HOME and the project pointed at
// throwaways. The ANTHROPIC_DEFAULT_*_MODEL variables are stripped from the
// inherited environment: a developer who has one exported would otherwise see
// every "nothing mapped" case fail.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const SCRIPT = new URL('model-tiers.mjs', import.meta.url).pathname;

const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !/^ANTHROPIC_DEFAULT_\w+_MODEL$/.test(key) && key !== 'CLAUDE_CONFIG_DIR'
  )
);

const sandbox = () => ({
  home: mkdtempSync(join(tmpdir(), 'qoq-tiers-home-')),
  project: mkdtempSync(join(tmpdir(), 'qoq-tiers-')),
});

const settingsPath = ({ home, project }, scope) =>
  ({
    user: join(home, '.claude', 'settings.json'),
    project: join(project, '.claude', 'settings.json'),
    local: join(project, '.claude', 'settings.local.json'),
  })[scope];

const write = (box, scope, settings) => {
  const path = settingsPath(box, scope);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(settings));
};

const read = (box, scope) => JSON.parse(readFileSync(settingsPath(box, scope), 'utf8'));

const run = ({ home, project }, ...args) =>
  spawnSync(process.execPath, [SCRIPT, '--project', project, ...args], {
    encoding: 'utf8',
    env: { ...cleanEnv, HOME: home },
  });

test('no config prints nothing and creates no file', () => {
  const box = sandbox();
  const { status, stdout } = run(box);

  assert.equal(status, 0);
  assert.equal(stdout, '');
  for (const scope of ['user', 'project', 'local']) {
    assert.equal(existsSync(settingsPath(box, scope)), false);
  }
});

test('project settings override the global file for the same tier', () => {
  const box = sandbox();
  write(box, 'user', {
    env: {
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-opus-5-5',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-opus-5-5',
    },
  });
  write(box, 'project', { env: { ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-5' } });
  write(box, 'local', { env: { ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5' } });

  assert.equal(run(box).stdout, '');
  assert.match(
    run(box, '--failed', 'haiku').stdout,
    /claude-haiku-4-5, set as .* in local settings/
  );
  assert.match(
    run(box, '--failed', 'sonnet').stdout,
    /claude-sonnet-5, set as .* in project settings/
  );
});

test('an unmapped tier falls through to the default alias', () => {
  const box = sandbox();
  write(box, 'user', { env: { ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-opus-5-5' } });

  const { stdout } = run(box);
  assert.match(stdout, /^WARN: haiku/);
  assert.doesNotMatch(stdout, /sonnet|^WARN: opus/m);
  assert.match(run(box, '--failed', 'sonnet').stdout, /points at the default alias/);
});

test('a failed tier is named, and nothing is written until --set', () => {
  const box = sandbox();
  write(box, 'local', { permissions: { allow: ['Bash(npm test)'] }, env: { FOO: '1' } });
  const before = readFileSync(settingsPath(box, 'local'), 'utf8');

  const report = run(box, '--failed', 'sonnet');
  assert.equal(report.status, 0);
  assert.match(report.stdout, /^tier `sonnet` did not resolve/);
  assert.match(report.stdout, /confirmed both/);
  assert.match(report.stdout, /never save the choice to memory/);
  run(box);
  assert.equal(readFileSync(settingsPath(box, 'local'), 'utf8'), before);
  assert.equal(existsSync(settingsPath(box, 'user')), false);

  const set = run(box, '--set', 'sonnet=claude-sonnet-5', '--scope', 'local');
  assert.equal(set.status, 0);
  assert.deepEqual(read(box, 'local'), {
    permissions: { allow: ['Bash(npm test)'] },
    env: { FOO: '1', ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-5' },
  });
  assert.equal(existsSync(settingsPath(box, 'project')), false);
});

test('--set refuses the committed project file and a missing scope', () => {
  const box = sandbox();

  assert.equal(run(box, '--set', 'sonnet=claude-sonnet-5', '--scope', 'project').status, 2);
  assert.equal(run(box, '--set', 'sonnet=claude-sonnet-5').status, 2);
  assert.equal(existsSync(settingsPath(box, 'project')), false);
});

test('a settings file that is not JSON is never rewritten', () => {
  const box = sandbox();
  write(box, 'user', {});
  writeFileSync(settingsPath(box, 'user'), '{ broken');

  assert.equal(run(box, '--set', 'haiku=claude-haiku-4-5', '--scope', 'user').status, 2);
  assert.equal(readFileSync(settingsPath(box, 'user'), 'utf8'), '{ broken');
});

test('a cheaper tier sent to a dearer family warns in one line', () => {
  const box = sandbox();
  write(box, 'user', {
    env: {
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-opus-5-5',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-5',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'arn:aws:bedrock:us-east-1:1:custom-model/abc',
    },
  });

  assert.deepEqual(run(box).stdout.trim().split('\n'), [
    `WARN: haiku → claude-opus-5-5 (opus) costs more than the tier it replaces — set in user settings (${settingsPath(box, 'user')})`,
  ]);
});

test('--set prints the warning for a dearer mapping straight away', () => {
  const { stdout } = run(sandbox(), '--set', 'sonnet=claude-opus-5-5', '--scope', 'local');

  assert.match(stdout, /^mapped sonnet/);
  assert.match(stdout, /^WARN: sonnet → claude-opus-5-5 \(opus\)/m);
});
