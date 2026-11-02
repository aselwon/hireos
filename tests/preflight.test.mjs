import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import test from 'node:test';

const secret = 'synthetic-private-preflight-value';
const configuration = `HIREOS_RECRUITER_PASSWORD=${secret}
MODEL_PROVIDER=cloudflare
MODEL_DAILY_NEURON_CAP=9000
CF_ACCOUNT_ID=2791466c5820cfd886aad95e0d3ef948
CF_AI_TOKEN=${secret}
RETENTION_DAYS=180
PRIVACY_CONTROLLER_NAME=Synthetic
PRIVACY_CONTROLLER_ADDRESS=Synthetic
PRIVACY_CONTROLLER_CONTACT=synthetic@example.invalid
`;

async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'hireos-preflight-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const data = join(root, 'var/lib/hireos');
  const saved = join(root, 'var/backups/hireos/backup-synthetic');
  for (const dir of [data, join(saved, 'cv'), join(root, 'etc/hireos')]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const envFile = join(root, 'etc/hireos/env');
  writeFileSync(envFile, configuration, { mode: 0o600 });
  writeFileSync(
    join(root, 'etc/passwd'),
    `hireos:x:${process.getuid()}:${process.getgid()}::/:/bin/false\n`
  );
  const database = join(data, 'preview.sqlite');
  const db = new DatabaseSync(database);
  db.exec(
    'PRAGMA journal_mode=WAL; CREATE TABLE sample (id INTEGER); INSERT INTO sample VALUES (42)'
  );
  t.after(() => db.close());
  chmodSync(database, 0o600);
  await backup(db, join(saved, 'hireos.sqlite'));
  const manifest = { createdAt: new Date().toISOString(), database: { sample: 1 }, cvFiles: 0 };
  writeFileSync(join(saved, 'manifest.json'), JSON.stringify(manifest));
  // Test the pinned production version independently of the supported test host.
  // Later probes can override this value to exercise the version rejection.
  const versionProbe = join(root, 'version.cjs');
  const requiredNode = readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim();
  writeFileSync(
    versionProbe,
    `Object.defineProperty(process.versions, 'node', { value: ${JSON.stringify(requiredNode)}, configurable: true });`
  );
  const run = (extra = {}) => {
    const result = spawnSync('bash', [resolve('ops/preflight.sh'), '--root', root], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ...extra,
        NODE_OPTIONS: `--require=${versionProbe} ${extra.NODE_OPTIONS || ''}`,
      },
    });
    assert.ifError(result.error);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
    for (const line of result.stdout.trim().split('\n')) {
      assert.match(
        line,
        /^(?:OK: (?:wersja Node|konfiguracja env \(wartości ukryte\)|uprawnienia danych|wolne miejsce|świeży backup|migracje na kopii; preflight zakończony)|BŁĄD: (?:argumenty|wersja Node|plik env|uprawnienia danych|wolne miejsce|świeży backup|migracje na kopii))$/
      );
    }
    assert.ok(
      result.stderr === '' ||
        result.stderr === 'BŁĄD: preflight nie przeszedł; wdrożenie wstrzymane.\n'
    );
    return result;
  };
  return { root, data, saved, envFile, database, db, manifest, run };
}

test('preflight migrates a WAL snapshot only, is repeatable and cleans temporary copies', async (t) => {
  const f = await fixture(t);
  const before = readFileSync(f.database);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = f.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /OK: migracje na kopii/);
    assert.deepEqual(readFileSync(f.database), before);
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='schema_migrations'").get()
        .n,
      0
    );
    assert.equal(f.db.prepare('SELECT id FROM sample').get().id, 42);
    assert.equal(
      readdirSync(f.data).some((name) => name.startsWith('.preflight-')),
      false
    );
  }
});

test('preflight rejects missing, empty, malformed and unsafe env without executing or exposing values', async (t) => {
  const f = await fixture(t);
  for (const content of [
    configuration.replace('CF_AI_TOKEN=', 'OTHER='),
    configuration.replace(`CF_AI_TOKEN=${secret}`, 'CF_AI_TOKEN=""'),
    `${configuration}INVALID ${secret}\n`,
    `${configuration}HIREOS_DB=${secret}\n`,
    configuration.replace('MODEL_DAILY_NEURON_CAP=9000', 'MODEL_DAILY_NEURON_CAP=10000'),
    configuration.replace('MODEL_PROVIDER=cloudflare', 'MODEL_PROVIDER=fake'),
  ]) {
    writeFileSync(f.envFile, content);
    const result = f.run();
    assert.equal(result.status, 1);
    assert.match(result.stdout, /BŁĄD: plik env/);
  }
  const marker = join(f.root, 'executed');
  writeFileSync(f.envFile, configuration.replace(secret, `$(touch ${marker})`));
  f.run();
  assert.equal(existsSync(marker), false);
  writeFileSync(f.envFile, configuration);
  chmodSync(f.envFile, 0o644);
  assert.equal(f.run().status, 1);
  rmSync(f.envFile);
  assert.equal(f.run().status, 1);
});

test('preflight rejects insecure data, stale/missing/corrupt backups and failed migrations', async (t) => {
  const f = await fixture(t);
  chmodSync(f.data, 0o755);
  assert.match(f.run().stdout, /BŁĄD: uprawnienia danych/);
  chmodSync(f.data, 0o700);
  for (const createdAt of ['invalid', '2000-01-01T00:00:00Z', '2999-01-01T00:00:00Z']) {
    writeFileSync(join(f.saved, 'manifest.json'), JSON.stringify({ ...f.manifest, createdAt }));
    assert.match(f.run().stdout, /BŁĄD: świeży backup/);
  }
  writeFileSync(join(f.saved, 'manifest.json'), JSON.stringify(f.manifest));
  f.db.exec(
    "CREATE TABLE schema_migrations (version INTEGER, name TEXT); INSERT INTO schema_migrations VALUES (999, 'unsupported')"
  );
  assert.match(f.run().stdout, /BŁĄD: migracje na kopii/);
  assert.equal(
    readdirSync(f.data).some((name) => name.startsWith('.preflight-')),
    false
  );
  writeFileSync(join(f.saved, 'hireos.sqlite'), secret);
  assert.match(f.run().stdout, /BŁĄD: świeży backup/);
  rmSync(f.saved, { recursive: true });
  assert.match(f.run().stdout, /BŁĄD: świeży backup/);
});

test('preflight rejects wrong Node and insufficient disk space using isolated runtime probes', async (t) => {
  const f = await fixture(t);
  const probe = join(f.root, 'probe.cjs');
  for (const [code, stage] of [
    ["Object.defineProperty(process.versions, 'node', { value: '0.0.0' });", 'wersja Node'],
    [
      "require('node:fs/promises').statfs = async () => ({ bavail: 0, bsize: 4096 });",
      'wolne miejsce',
    ],
  ]) {
    writeFileSync(probe, code);
    const result = f.run({ NODE_OPTIONS: `--require=${probe}` });
    assert.equal(result.status, 1);
    assert.match(result.stdout, new RegExp(`BŁĄD: ${stage}`));
  }
});
