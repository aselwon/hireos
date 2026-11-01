import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

test('backup restores SQLite table counts and CV files to a clean directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hireos-backup-test-'));
  const dataDir = join(root, 'data');
  const backupDir = join(root, 'backups');
  const target = join(root, 'restored');
  const databasePath = join(dataDir, 'preview.sqlite');
  await mkdir(join(dataDir, 'cv'), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec('CREATE TABLE sample (id INTEGER PRIMARY KEY); INSERT INTO sample VALUES (1), (2)');
  db.close();
  await writeFile(join(dataDir, 'cv', 'synthetic.pdf'), 'synthetic');

  process.env.HIREOS_DATA_DIR = dataDir;
  process.env.HIREOS_DB = databasePath;
  process.env.HIREOS_BACKUP_DIR = backupDir;
  process.env.HIREOS_BACKUP_RETENTION = '1';
  try {
    const { backupData, restore } = await import('../ops/backup.mjs');
    await backupData();
    await backupData();
    const backups = await readdir(backupDir);
    assert.equal(backups.length, 1);
    const [backupName] = backups;
    const backupPath = join(backupDir, backupName);
    const manifest = JSON.parse(await readFile(join(backupPath, 'manifest.json'), 'utf8'));
    assert.equal(manifest.database.sample, 2);
    assert.equal(manifest.cvFiles, 1);

    await restore(backupPath, target);
    const copy = new DatabaseSync(join(target, 'preview.sqlite'), { readOnly: true });
    assert.equal(copy.prepare('SELECT count(*) AS count FROM sample').get().count, 2);
    copy.close();
    assert.equal(await readFile(join(target, 'cv', 'synthetic.pdf'), 'utf8'), 'synthetic');
    await assert.rejects(restore(backupPath, target), /empty directory/);
  } finally {
    delete process.env.HIREOS_DATA_DIR;
    delete process.env.HIREOS_DB;
    delete process.env.HIREOS_BACKUP_DIR;
    delete process.env.HIREOS_BACKUP_RETENTION;
    await rm(root, { recursive: true, force: true });
  }
});
