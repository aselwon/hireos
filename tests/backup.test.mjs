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
  const external = join(root, 'external');
  const keyFile = join(root, 'backup.key');
  const databasePath = join(dataDir, 'preview.sqlite');
  await mkdir(join(dataDir, 'cv'), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec('CREATE TABLE sample (id INTEGER PRIMARY KEY); INSERT INTO sample VALUES (1), (2)');
  db.close();
  await writeFile(join(dataDir, 'cv', 'synthetic.pdf'), 'synthetic');
  await writeFile(keyFile, Buffer.alloc(32, 7).toString('hex'));

  process.env.HIREOS_DATA_DIR = dataDir;
  process.env.HIREOS_DB = databasePath;
  process.env.HIREOS_BACKUP_DIR = backupDir;
  process.env.HIREOS_BACKUP_RETENTION = '1';
  process.env.HIREOS_BACKUP_KEY_FILE = keyFile;
  process.env.HIREOS_BACKUP_EXTERNAL_DIR = external;
  try {
    const { backupData, restore } = await import('../ops/backup.mjs');
    await backupData();
    await backupData();
    const backups = await readdir(backupDir);
    assert.equal(backups.length, 1);
    const [backupName] = backups;
    const backupPath = join(backupDir, backupName);
    const manifest = JSON.parse(await readFile(join(backupPath, 'manifest.json'), 'utf8'));
    assert.equal(manifest.encrypted, true);
    const encrypted = await readFile(join(backupPath, 'backup.enc'), 'utf8');
    assert.equal(encrypted.includes('synthetic'), false);
    assert.equal((await readdir(external)).length, 2);

    await restore(backupPath, target);
    const copy = new DatabaseSync(join(target, 'preview.sqlite'), { readOnly: true });
    assert.equal(copy.prepare('SELECT count(*) AS count FROM sample').get().count, 2);
    copy.close();
    assert.equal(await readFile(join(target, 'cv', 'synthetic.pdf'), 'utf8'), 'synthetic');
    await assert.rejects(restore(backupPath, target), /empty directory/);
    delete process.env.HIREOS_BACKUP_EXTERNAL_DIR;
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (message) => warnings.push(message);
    try {
      await backupData();
    } finally {
      console.warn = originalWarn;
    }
    assert.match(warnings[0], /only locally/);
  } finally {
    delete process.env.HIREOS_DATA_DIR;
    delete process.env.HIREOS_DB;
    delete process.env.HIREOS_BACKUP_DIR;
    delete process.env.HIREOS_BACKUP_RETENTION;
    delete process.env.HIREOS_BACKUP_KEY_FILE;
    delete process.env.HIREOS_BACKUP_EXTERNAL_DIR;
    await rm(root, { recursive: true, force: true });
  }
});
