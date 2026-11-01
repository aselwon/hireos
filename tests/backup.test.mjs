import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('SQLite backup and clean restore preserve record and CV file counts', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hireos-backup-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sourceData = join(root, 'source');
  const sourceDb = join(root, 'source.sqlite');
  const backup = join(root, 'backups', 'hireos-2026-11-01');
  const restoredData = join(root, 'restored');
  const restoredDb = join(root, 'restored.sqlite');
  mkdirSync(join(sourceData, 'cv'), { recursive: true });
  writeFileSync(join(sourceData, 'cv', 'synthetic.pdf'), '%PDF synthetic fixture');
  const setup = spawnSync(
    process.execPath,
    [
      '--experimental-sqlite',
      '--input-type=module',
      '-e',
      `import {openStore} from './lib/store.mjs'; const s=openStore(${JSON.stringify(sourceDb)}); s.close();
       const {DatabaseSync}=await import('node:sqlite');
       const db=new DatabaseSync(${JSON.stringify(sourceDb)});
       db.exec("CREATE TABLE synthetic_records (id INTEGER PRIMARY KEY); INSERT INTO synthetic_records VALUES (1), (2)");
       db.close();`,
    ],
    { encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: undefined } }
  );
  assert.equal(setup.status, 0, setup.stderr);
  const run = (args) =>
    spawnSync(process.execPath, ['--experimental-sqlite', 'ops/backup.mjs', ...args], {
      encoding: 'utf8',
      env: { ...process.env, NODE_TEST_CONTEXT: undefined },
    });
  const saved = run([
    'backup',
    '--db',
    sourceDb,
    '--data-dir',
    sourceData,
    '--destination',
    backup,
  ]);
  assert.equal(saved.status, 0, saved.stderr);
  const manifest = JSON.parse(readFileSync(join(backup, 'manifest.json')));
  assert.equal(manifest.cvFiles, 1);
  assert.equal(manifest.records.synthetic_records, 2);
  const defaultLayout = run(['backup', '--db', sourceDb, '--data-dir', sourceData]);
  assert.equal(defaultLayout.status, 0, defaultLayout.stderr);
  const restored = run([
    'restore',
    '--from',
    backup,
    '--db',
    restoredDb,
    '--data-dir',
    restoredData,
  ]);
  assert.equal(restored.status, 0, restored.stderr);
  assert.match(restored.stdout, /"synthetic_records":2/);
  assert.match(restored.stdout, /"cvFiles":1/);
  assert.equal(
    readFileSync(join(restoredData, 'cv', 'synthetic.pdf'), 'utf8'),
    '%PDF synthetic fixture'
  );
  const refused = run([
    'restore',
    '--from',
    backup,
    '--db',
    restoredDb,
    '--data-dir',
    restoredData,
  ]);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /Restore target must be empty/);
  for (const field of ['records', 'cvFiles']) {
    const corrupted = structuredClone(manifest);
    if (field === 'records') {
      corrupted.records.synthetic_records++;
    } else {
      corrupted.cvFiles++;
    }
    writeFileSync(join(backup, 'manifest.json'), JSON.stringify(corrupted));
    const failed = run([
      'restore',
      '--from',
      backup,
      '--db',
      join(root, `invalid-${field}.sqlite`),
      '--data-dir',
      join(root, `invalid-${field}`),
    ]);
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /Restore verification failed/);
  }
  writeFileSync(join(backup, 'manifest.json'), JSON.stringify(manifest));
  const unrelated = join(root, 'backups', 'hireos-not-a-backup');
  mkdirSync(unrelated);
  const newer = join(root, 'backups', 'hireos-2026-11-02');
  const rotated = run([
    'backup',
    '--db',
    sourceDb,
    '--data-dir',
    sourceData,
    '--destination',
    newer,
    '--keep',
    '1',
  ]);
  assert.equal(rotated.status, 0, rotated.stderr);
  assert.equal(existsSync(backup), false);
  assert.equal(existsSync(newer), true);
  assert.equal(existsSync(unrelated), true);
});
