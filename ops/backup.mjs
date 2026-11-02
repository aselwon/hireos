import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync, backup } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const usage =
  'Usage: node --experimental-sqlite ops/backup.mjs backup | restore BACKUP_DIR EMPTY_TARGET_DIR';
const dataDir = resolve(process.env.HIREOS_DATA_DIR || '/var/lib/hireos');
const databasePath = resolve(process.env.HIREOS_DB || join(dataDir, 'preview.sqlite'));
const backupRoot = resolve(process.env.HIREOS_BACKUP_DIR || '/var/backups/hireos');
const retention = Number(process.env.HIREOS_BACKUP_RETENTION || 14);
async function encryptionKey() {
  const keyFile = resolve(process.env.HIREOS_BACKUP_KEY_FILE || '/etc/hireos/backup.key');
  const value = (await readFile(keyFile, 'utf8')).trim();
  const key = /^[a-f\d]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('Backup key must contain 32 raw bytes, 64 hex characters, or base64 for 32 bytes.');
  return key;
}

function encrypt(value, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: ciphertext.toString('base64') };
}

function decrypt(value, key) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]);
}

async function collectFiles(path, prefix = '') {
  const result = {};
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, await collectFiles(join(path, entry.name), relative));
    else if (entry.isFile()) result[relative] = (await readFile(join(path, entry.name))).toString('base64');
    else throw new Error(`Unsupported backup file: ${join(path, entry.name)}`);
  }
  return result;
}

function inventory(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return Object.fromEntries(
      db
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all()
        .map(({ name }) => [
          name,
          db.prepare(`SELECT count(*) AS count FROM "${name}"`).get().count,
        ])
    );
  } finally {
    db.close();
  }
}

async function fileCount(path) {
  let count = 0;
  for (const entry of await readdir(path, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  })) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) count += await fileCount(entryPath);
    else if (entry.isFile()) count += 1;
    else throw new Error(`Unsupported file in CV directory: ${entryPath}`);
  }
  return count;
}

export async function backupData() {
  if (!Number.isInteger(retention) || retention < 1)
    throw new Error('HIREOS_BACKUP_RETENTION must be a positive integer.');
  await mkdir(backupRoot, { recursive: true, mode: 0o700 });
  const key = await encryptionKey();
  const staging = await mkdtemp(join(backupRoot, '.staging-'));
  try {
    const sourceDb = new DatabaseSync(databasePath, { readOnly: true });
    try {
      await backup(sourceDb, join(staging, 'hireos.sqlite'));
    } finally {
      sourceDb.close();
    }
    const cvPath = join(dataDir, 'cv');
    await cp(cvPath, join(staging, 'cv'), { recursive: true, errorOnExist: true }).catch(
      (error) => {
        if (error.code !== 'ENOENT') throw error;
        return mkdir(join(staging, 'cv'));
      }
    );
    const manifest = {
      createdAt: new Date().toISOString(),
      database: inventory(join(staging, 'hireos.sqlite')),
      cvFiles: await fileCount(join(staging, 'cv')),
    };
    const files = await collectFiles(staging);
    await rm(join(staging, 'hireos.sqlite'));
    await rm(join(staging, 'cv'), { recursive: true });
    await writeFile(join(staging, 'backup.enc'), JSON.stringify(encrypt(JSON.stringify({ manifest, files }), key)), { mode: 0o600 });
    await writeFile(join(staging, 'manifest.json'), `${JSON.stringify({ createdAt: manifest.createdAt, encrypted: true })}\n`, { mode: 0o600 });
    const name = `backup-${manifest.createdAt.replaceAll(':', '-').replaceAll('.', '-')}`;
    const destination = join(backupRoot, name);
    await rename(staging, destination);
    const externalBackupDir = process.env.HIREOS_BACKUP_EXTERNAL_DIR
      ? resolve(process.env.HIREOS_BACKUP_EXTERNAL_DIR)
      : null;
    if (externalBackupDir) {
      await mkdir(externalBackupDir, { recursive: true, mode: 0o700 });
      const externalStaging = join(externalBackupDir, `.${name}.staging`);
      await rm(externalStaging, { recursive: true, force: true });
      await cp(destination, externalStaging, { recursive: true, errorOnExist: true });
      await rename(externalStaging, join(externalBackupDir, name));
      console.log(`Encrypted backup copied to external destination: ${externalBackupDir}`);
    } else console.warn('HIREOS_BACKUP_EXTERNAL_DIR is unset; backup exists only locally.');
    const backups = (await readdir(backupRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^backup-/.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();
    await Promise.all(
      backups.slice(retention).map((entry) => rm(join(backupRoot, entry), { recursive: true }))
    );
    console.log(`Backup created: ${destination} (CV files: ${manifest.cvFiles})`);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function restore(backupDir, targetDir) {
  const source = resolve(backupDir);
  const target = resolve(targetDir);
  if (source === target || source.startsWith(`${target}/`) || target.startsWith(`${source}/`)) {
    throw new Error('Backup and restore target must be separate directories.');
  }
  const targetEntries = await readdir(target).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (targetEntries?.length) throw new Error('Restore target must be an empty directory.');
  const metadata = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
  const archive = JSON.parse(await readFile(join(source, 'backup.enc'), 'utf8'));
  const contents = JSON.parse(decrypt(archive, await encryptionKey()).toString('utf8'));
  const manifest = contents.manifest;
  const staged = await mkdtemp(join(tmpdir(), 'hireos-restore-'));
  try {
    if (!manifest.database || !Number.isInteger(manifest.cvFiles))
      throw new Error('Invalid backup manifest.');
    if (!metadata.encrypted) throw new Error('Backup is not encrypted.');
    const database = join(staged, 'hireos.sqlite');
    const cv = join(staged, 'cv');
    for (const [relative, value] of Object.entries(contents.files)) {
      const destination = join(staged, relative);
      if (!destination.startsWith(`${staged}/`)) throw new Error('Invalid path in encrypted backup.');
      await mkdir(resolve(destination, '..'), { recursive: true });
      await writeFile(destination, Buffer.from(value, 'base64'));
    }
    if (JSON.stringify(inventory(database)) !== JSON.stringify(manifest.database))
      throw new Error('Backup database counts do not match its manifest.');
    if ((await fileCount(cv)) !== manifest.cvFiles)
      throw new Error('Backup CV file count does not match its manifest.');
    await cp(database, join(staged, 'preview.sqlite'));
    if (
      JSON.stringify(inventory(join(staged, 'preview.sqlite'))) !==
      JSON.stringify(manifest.database)
    )
      throw new Error('Restored database counts do not match backup.');
    if ((await fileCount(join(staged, 'cv'))) !== manifest.cvFiles)
      throw new Error('Restored CV file count does not match backup.');
    await mkdir(target, { recursive: true, mode: 0o700 });
    await cp(join(staged, 'preview.sqlite'), join(target, 'preview.sqlite'));
    await cp(join(staged, 'cv'), join(target, 'cv'), { recursive: true });
    console.log(
      `Restore verified: ${target} (database table counts and ${manifest.cvFiles} CV files match)`
    );
  } finally {
    await rm(staged, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, ...args] = process.argv.slice(2);
  if (action === 'backup' && args.length === 0) await backupData();
  else if (action === 'restore' && args.length === 2) await restore(args[0], args[1]);
  else throw new Error(usage);
}
