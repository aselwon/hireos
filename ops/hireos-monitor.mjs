import { execFile as execFileCallback, exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, readFile, statfs, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const execFile = promisify(execFileCallback);
const exec = promisify(execCallback);

export function collectAlerts(metrics, thresholds = {}) {
  const alerts = [];
  const backupMaxAgeMs = thresholds.backupMaxAgeMs ?? 26 * 60 * 60 * 1000;
  const minFreeBytes = thresholds.minFreeBytes ?? 1024 ** 3;
  if (!metrics.healthOk) alerts.push('healthz');
  if (metrics.backupAgeMs == null || metrics.backupAgeMs > backupMaxAgeMs)
    alerts.push('backup-stale');
  if (metrics.freeBytes < minFreeBytes) alerts.push('disk-low');
  if (metrics.aiCapReached) alerts.push('ai-cap');
  if (metrics.errors5xx > 0) alerts.push('http-5xx');
  return alerts;
}

export function deduplicateAlerts(
  alerts,
  state = {},
  now = Date.now(),
  intervalMs = 60 * 60 * 1000
) {
  const next = { ...state };
  const emitted = alerts.filter((alert) => {
    if (now - (next[alert] ?? -Infinity) < intervalMs) return false;
    next[alert] = now;
    return true;
  });
  return { emitted, state: next };
}

async function latestBackupAge(backupDir, now) {
  const dirs = (await readdir(backupDir, { withFileTypes: true }).catch(() => [])).filter(
    (entry) => entry.isDirectory() && /^backup-/.test(entry.name)
  );
  const times = await Promise.all(
    dirs.map(async ({ name }) => {
      try {
        const manifest = JSON.parse(await readFile(join(backupDir, name, 'manifest.json'), 'utf8'));
        const value = Date.parse(manifest.createdAt);
        return Number.isFinite(value) ? value : null;
      } catch {
        return null;
      }
    })
  );
  const newest = Math.max(...times.filter(Number.isFinite));
  return Number.isFinite(newest) ? Math.max(0, now - newest) : null;
}

export async function sample(config = {}) {
  const now = config.now ?? Date.now();
  let healthOk = false;
  let aiCapReached = false;
  try {
    const response = await (config.fetch ?? fetch)(
      config.healthUrl ?? 'http://127.0.0.1:4317/healthz',
      { signal: AbortSignal.timeout(5000) }
    );
    healthOk = response.ok;
    if (response.ok) aiCapReached = Boolean((await response.json()).aiCapReached);
  } catch {}
  const backupAgeMs = await latestBackupAge(config.backupDir ?? '/var/backups/hireos', now);
  const disk = await statfs(config.dataDir ?? '/var/lib/hireos');
  let errors5xx = 0;
  try {
    const since = new Date(now - 5 * 60 * 1000).toISOString();
    const { stdout } = await execFile('journalctl', [
      '-u',
      'hireos-preview',
      '--since',
      since,
      '-o',
      'cat',
      '--no-pager',
    ]);
    errors5xx = stdout.split('\n').filter((line) => /\b5\d\d\b/.test(line)).length;
  } catch {}
  return { healthOk, backupAgeMs, freeBytes: disk.bavail * disk.bsize, aiCapReached, errors5xx };
}

export async function runMonitor(env = process.env) {
  const now = Date.now();
  const metrics = await sample({
    healthUrl: env.HIREOS_HEALTH_URL,
    backupDir: env.HIREOS_BACKUP_DIR,
    dataDir: env.HIREOS_DATA_DIR,
    now,
  });
  const alerts = collectAlerts(metrics, {
    backupMaxAgeMs: Number(env.HIREOS_MONITOR_BACKUP_MAX_AGE_HOURS ?? 26) * 60 * 60 * 1000,
    minFreeBytes: Number(env.HIREOS_MONITOR_MIN_FREE_GB ?? 1) * 1024 ** 3,
  });
  const statePath = resolve(env.HIREOS_MONITOR_STATE ?? '/var/lib/hireos/monitor-state.json');
  await mkdir(resolve(statePath, '..'), { recursive: true, mode: 0o700 });
  const previous = JSON.parse(await readFile(statePath, 'utf8').catch(() => '{}'));
  const result = deduplicateAlerts(alerts, previous, now);
  await writeFile(statePath, `${JSON.stringify(result.state)}\n`, { mode: 0o600 });
  for (const alert of result.emitted) {
    const message = `HIREOS_ALERT ${alert}`;
    if (env.ALERT_COMMAND)
      await exec(env.ALERT_COMMAND, { env: { PATH: process.env.PATH, HIREOS_ALERT: alert } });
    else console.log(message);
  }
  return { metrics, alerts: result.emitted };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  await runMonitor();
}
