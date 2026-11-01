import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

test('release A → B → A: atomowy wybór kodu, trwałe dane i błędy operatora', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hireos-deploy-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, 'installation');
  const source = join(dir, 'source');
  const bin = join(dir, 'bin');
  for (const path of [
    root,
    bin,
    join(source, 'lib'),
    join(source, 'ops'),
    join(source, 'hireos/dist'),
  ]) {
    mkdirSync(path, { recursive: true });
  }
  writeFileSync(join(root, 'persistent.sqlite'), 'synthetic database');
  writeFileSync(join(source, 'package.json'), '{}');
  writeFileSync(join(source, 'ops/backup.mjs'), '// synthetic backup');
  writeFileSync(join(source, 'lib/runtime.mjs'), '// synthetic');
  writeFileSync(join(source, 'hireos/dist/index.html'), 'synthetic');
  writeFileSync(join(source, '.env'), 'synthetic-excluded');
  const log = join(dir, 'commands');
  for (const command of ['systemctl', 'curl']) {
    writeFileSync(
      join(bin, command),
      `#!/bin/sh\nprintf '%s\\n' '${command}' >> "$DEPLOY_TEST_LOG"\nexit "\${DEPLOY_TEST_FAILURE:-0}"\n`,
      { mode: 0o755 }
    );
  }
  const script = resolve('ops/deploy.sh');
  const run = (args, extra = {}) =>
    spawnSync('bash', [script, ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, DEPLOY_TEST_LOG: log, ...extra },
    });
  const deploy = (id, extra) => run(['--owner', root, 'deploy', id, source], extra);
  writeFileSync(join(source, 'server.mjs'), 'release A');
  assert.equal(run([root, 'deploy', 'A', source]).status, 2);
  assert.equal(deploy('../escape').status, 2);
  assert.equal(deploy('A').status, 0);
  assert.equal(readFileSync(join(root, 'current/ops/backup.mjs'), 'utf8'), '// synthetic backup');
  writeFileSync(join(source, 'server.mjs'), 'release B');
  assert.equal(deploy('B').status, 0);
  assert.equal(readFileSync(join(root, 'current/server.mjs'), 'utf8'), 'release B');
  assert.equal(deploy('B').status, 1);
  assert.equal(run(['--owner', root, 'rollback', 'missing']).status, 1);
  assert.equal(readlinkSync(join(root, 'current')), join(root, 'releases/B'));
  assert.equal(run(['--owner', root, 'rollback', 'A']).status, 0);
  assert.equal(readlinkSync(join(root, 'current')), join(root, 'releases/A'));
  assert.equal(readFileSync(join(root, 'current/server.mjs'), 'utf8'), 'release A');
  assert.equal(readFileSync(join(root, 'current/REVISION'), 'utf8'), 'A\n');
  assert.equal(readFileSync(join(root, 'persistent.sqlite'), 'utf8'), 'synthetic database');
  assert.throws(() => readFileSync(join(root, 'current/.env')), { code: 'ENOENT' });
  assert.equal(readFileSync(log, 'utf8'), 'systemctl\ncurl\nsystemctl\ncurl\nsystemctl\ncurl\n');
  assert.equal(deploy('C', { DEPLOY_TEST_FAILURE: '1' }).status, 1);
  assert.equal(readlinkSync(join(root, 'current')), join(root, 'releases/C'));
  assert.equal(run(['--owner', root, 'rollback', 'A']).status, 0);
});

test('bootstrap używa trwałego katalogu danych poza release (bez otwierania portu)', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hireos-startup-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dataDir = join(dir, 'persistent');
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-sqlite',
      '--input-type=module',
      '-e',
      `import http from 'node:http';
       http.Server.prototype.listen = function (port, host, callback) {
         if (host !== '127.0.0.1') throw new Error('Unexpected host');
         callback();
         queueMicrotask(() => process.emit('SIGTERM'));
       };
       http.Server.prototype.close = function (callback) { callback(); };
       await import('./server.mjs');`,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        HIREOS_DATA_DIR: dataDir,
        HIREOS_DB: '',
        HIREOS_RECRUITER_PASSWORD: 'synthetic-startup-password',
        MODEL_PROVIDER: 'fake',
      },
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(join(dataDir, 'hireos.sqlite')).subarray(0, 16).toString(), /^SQLite/);
});
