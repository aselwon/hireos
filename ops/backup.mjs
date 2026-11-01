import { backup as sqliteBackup, DatabaseSync } from 'node:sqlite';
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
function parseArgs(args) {
  const [command, ...options] = args;
  const values = {};
  for (let i = 0; i < options.length; i += 2) {
    if (!options[i]?.startsWith('--') || !options[i + 1]) throw new Error('Invalid arguments.');
    values[options[i].slice(2)] = options[i + 1];
  }
  return { command, values };
}

function counts(db) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all();
  return Object.fromEntries(
    tables.map(({ name }) => [
      name,
      db.prepare(`SELECT count(*) AS count FROM "${name.replaceAll('"', '""')}"`).get().count,
    ])
  );
}

async function fileCount(directory) {
  try {
    let count = 0;
    for (const name of await readdir(directory)) {
      const path = join(directory, name);
      if ((await stat(path)).isDirectory()) count += await fileCount(path);
      else count++;
    }
    return count;
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}

async function backupData(dbPath, dataDir, destination, keep) {
  const source = resolve(dbPath);
  const data = resolve(dataDir);
  const output = resolve(destination);
  const cvDirectory = join(data, 'cv');
  if (
    !Number.isInteger(keep) ||
    keep < 1 ||
    output === cvDirectory ||
    output.startsWith(`${cvDirectory}/`)
  ) {
    throw new Error('Invalid backup destination or retention count.');
  }
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  const staging = `${output}.tmp-${process.pid}`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { mode: 0o700 });
  try {
    const db = new DatabaseSync(source, { readOnly: true });
    let recordCounts;
    try {
      await sqliteBackup(db, join(staging, 'database.sqlite'));
    } finally {
      db.close();
    }
    const snapshot = new DatabaseSync(join(staging, 'database.sqlite'), { readOnly: true });
    try {
      recordCounts = counts(snapshot);
    } finally {
      snapshot.close();
    }
    await cp(join(data, 'cv'), join(staging, 'cv'), { recursive: true, errorOnExist: true }).catch(
      (error) => {
        if (error.code !== 'ENOENT') throw error;
      }
    );
    const manifest = {
      createdAt: new Date().toISOString(),
      database: basename(source),
      records: recordCounts,
      cvFiles: await fileCount(join(staging, 'cv')),
    };
    await writeFile(join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(staging, output);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  const parent = dirname(output);
  const backups = (await readdir(parent, { withFileTypes: true }))
    .filter(
      (entry) => entry.isDirectory() && /^hireos-\d{4}-\d{2}-\d{2}(?:T[\d.-]+Z)?$/.test(entry.name)
    )
    .map((entry) => entry.name)
    .sort()
    .reverse();
  await Promise.all(
    backups.slice(keep).map((name) => rm(join(parent, name), { recursive: true, force: true }))
  );
  process.stdout.write(`Backup created: ${output}\n`);
}

async function restoreData(source, dbPath, dataDir) {
  const backupDir = resolve(source);
  const targetDb = resolve(dbPath);
  const targetData = resolve(dataDir);
  const entries = await readdir(targetData).catch((error) =>
    error.code === 'ENOENT' ? [] : Promise.reject(error)
  );
  if (
    entries.length ||
    (await stat(targetDb).then(
      () => true,
      () => false
    ))
  )
    throw new Error('Restore target must be empty.');
  const manifest = JSON.parse(await readFile(join(backupDir, 'manifest.json'), 'utf8'));
  await mkdir(targetData, { recursive: true, mode: 0o700 });
  await mkdir(dirname(targetDb), { recursive: true, mode: 0o700 });
  await cp(join(backupDir, 'database.sqlite'), targetDb);
  await cp(join(backupDir, 'cv'), join(targetData, 'cv'), { recursive: true }).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  const db = new DatabaseSync(targetDb, { readOnly: true });
  try {
    const restoredCounts = counts(db);
    const restoredFiles = await fileCount(join(targetData, 'cv'));
    if (
      JSON.stringify(restoredCounts) !== JSON.stringify(manifest.records) ||
      restoredFiles !== manifest.cvFiles
    ) {
      throw new Error('Restore verification failed: record or CV file counts differ.');
    }
    process.stdout.write(
      `Restore verified: ${JSON.stringify({ records: restoredCounts, cvFiles: restoredFiles })}\n`
    );
  } finally {
    db.close();
  }
}

try {
  const { command, values } = parseArgs(process.argv.slice(2));
  const dbPath =
    values.db ||
    process.env.HIREOS_DB ||
    resolve(process.env.HIREOS_DATA_DIR || join(root, 'data'), 'hireos.sqlite');
  const dataDir = values['data-dir'] || process.env.HIREOS_DATA_DIR || dirname(dbPath);
  if (command === 'backup') {
    const destination =
      values.destination ||
      join(dataDir, 'backups', `hireos-${new Date().toISOString().replaceAll(':', '-')}`);
    await backupData(dbPath, dataDir, destination, Number(values.keep || 14));
  } else if (command === 'restore' && values.from) {
    await restoreData(values.from, dbPath, dataDir);
  } else
    throw new Error(
      'Usage: backup.mjs backup [--db PATH --data-dir PATH --destination PATH --keep N] | restore --from DIR [--db PATH --data-dir PATH]'
    );
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
