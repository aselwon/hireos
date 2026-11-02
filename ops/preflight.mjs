import { constants } from 'node:fs';
import { access, lstat, mkdtemp, readFile, readdir, rm, statfs } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { loadConfig } from '../lib/config.mjs';
import { migrate } from '../lib/migrations.mjs';

let stage = 'argumenty';
try {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--root')) throw new Error();
  const root = resolve(args[1] || '/');
  const data = join(root, 'var/lib/hireos');
  const database = join(data, 'preview.sqlite');
  const backups = join(root, 'var/backups/hireos');
  stage = 'wersja Node';
  const required = (await readFile(new URL('../.nvmrc', import.meta.url), 'utf8')).trim();
  if (process.versions.node !== required) throw new Error();
  console.log('OK: wersja Node');

  stage = 'plik env';
  const envPath = join(root, 'etc/hireos/env');
  const envStat = await lstat(envPath);
  if (!envStat.isFile() || (envStat.mode & 0o777) !== 0o600 || envStat.uid !== process.getuid())
    throw new Error();
  const env = Object.create(null);
  // Celowo wąski podzbiór EnvironmentFile: jedna linia na wartość, bez ekspansji.
  for (const line of (await readFile(envPath, 'utf8')).split('\n')) {
    if (!line.trim() || /^\s*[#;]/.test(line)) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match || Object.hasOwn(env, match[1])) throw new Error();
    let value = match[2].trim();
    if (/^["']/.test(value)) {
      const quote = value[0];
      if (value.at(-1) !== quote) throw new Error();
      value = value.slice(1, -1);
      if (value.includes(quote)) throw new Error();
    } else if (/["']/.test(value)) throw new Error();
    if (value.includes('\\')) throw new Error();
    env[match[1]] = value;
  }
  const requiredKeys = [
    'HIREOS_RECRUITER_PASSWORD',
    'MODEL_PROVIDER',
    'MODEL_DAILY_NEURON_CAP',
    'CF_ACCOUNT_ID',
    'CF_AI_TOKEN',
    'RETENTION_DAYS',
    'PRIVACY_CONTROLLER_NAME',
    'PRIVACY_CONTROLLER_ADDRESS',
    'PRIVACY_CONTROLLER_CONTACT',
  ];
  if (requiredKeys.some((key) => !env[key])) throw new Error();
  // Nie pozwalamy env zmienić ścieżek, które sprawdzamy, ani zabezpieczeń jednostki.
  const fixed = {
    NODE_ENV: 'production',
    PORT: '4317',
    HIREOS_SECURE_COOKIE: '1',
    HIREOS_DATA_DIR: '/var/lib/hireos',
    HIREOS_DB: '/var/lib/hireos/preview.sqlite',
  };
  for (const [key, value] of Object.entries(fixed)) {
    if (Object.hasOwn(env, key) && env[key] !== value) throw new Error();
    env[key] = value;
  }
  if (env.HIREOS_PASSWORD_FILE) throw new Error();
  // Walidacja bez dostawcy i bez odczytu hasła z produkcyjnej ścieżki.
  loadConfig({ ...env, HIREOS_PASSWORD_FILE: join(envPath, 'no-password-file') });
  console.log('OK: konfiguracja env (wartości ukryte)');

  stage = 'uprawnienia danych';
  const user = (await readFile(join(root, 'etc/passwd'), 'utf8'))
    .split('\n')
    .find((line) => line.startsWith('hireos:'))
    ?.split(':');
  const dataStat = await lstat(data);
  if (
    !user ||
    !dataStat.isDirectory() ||
    (dataStat.mode & 0o777) !== 0o700 ||
    dataStat.uid !== Number(user[2]) ||
    dataStat.gid !== Number(user[3])
  )
    throw new Error();
  await access(data, constants.R_OK | constants.W_OK | constants.X_OK);
  const dbStat = await lstat(database);
  if (!dbStat.isFile() || dbStat.uid !== dataStat.uid || dbStat.mode & 0o077) throw new Error();
  console.log('OK: uprawnienia danych');

  stage = 'wolne miejsce';
  const space = await statfs(data);
  if (space.bavail * space.bsize < Math.max(1024 ** 3, dbStat.size * 3)) throw new Error();
  console.log('OK: wolne miejsce');

  stage = 'świeży backup';
  let fresh = false;
  for (const entry of await readdir(backups, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('backup-')) continue;
    try {
      const path = join(backups, entry.name);
      const manifest = JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8'));
      const age = Date.now() - Date.parse(manifest.createdAt);
      if (
        !(age >= 0 && age <= 24 * 60 * 60 * 1000) ||
        !manifest.database ||
        !Number.isInteger(manifest.cvFiles) ||
        manifest.cvFiles < 0
      )
        continue;
      if (!(await lstat(join(path, 'cv'))).isDirectory()) continue;
      const db = new DatabaseSync(join(path, 'hireos.sqlite'), { readOnly: true });
      try {
        if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') continue;
        for (const [name, count] of Object.entries(manifest.database)) {
          const table = name.replaceAll('"', '""');
          if (db.prepare(`SELECT count(*) AS count FROM "${table}"`).get().count !== count)
            throw new Error();
        }
        fresh = true;
      } finally {
        db.close();
      }
    } catch {
      /* Niekompletna kopia nie potwierdza gotowości. */
    }
  }
  if (!fresh) throw new Error();
  console.log('OK: świeży backup');

  stage = 'migracje na kopii';
  const temporary = await mkdtemp(join(data, '.preflight-'));
  try {
    const copyPath = join(temporary, 'dry-run.sqlite');
    const source = new DatabaseSync(database, { readOnly: true });
    try {
      await backup(source, copyPath);
    } finally {
      source.close();
    }
    const copy = new DatabaseSync(copyPath);
    try {
      migrate(copy);
      if (
        copy.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' ||
        copy.prepare('PRAGMA foreign_key_check').all().length
      )
        throw new Error();
    } finally {
      copy.close();
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  console.log('OK: migracje na kopii; preflight zakończony');
} catch {
  // Wyjątki SQLite, parsera i systemu plików mogą zawierać dane: nie drukujemy ich.
  console.log(`BŁĄD: ${stage}`);
  process.exitCode = 1;
}
