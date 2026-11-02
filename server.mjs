import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import http from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSessions, openKeys } from './lib/auth.mjs';
import { loadConfig } from './lib/config.mjs';
import { startCvWorker } from './lib/cv-queue.mjs';
import { createHandler } from './lib/http.mjs';
import { createLogger } from './lib/logger.mjs';
import { startRetentionSchedule } from './lib/retention.mjs';
import { openStore } from './lib/store.mjs';

const root = dirname(fileURLToPath(import.meta.url));
let revision = 'unknown';
try {
  revision = readFileSync(resolve(root, 'REVISION'), 'utf8').trim() || 'unknown';
} catch {
  // Local development has no release marker.
}
const config = loadConfig();
const logger = createLogger();
const dataDir = process.env.HIREOS_DATA_DIR || resolve(root, 'data');
await mkdir(dataDir, { recursive: true });
const sessions = createSessions(config.password);
delete process.env.HIREOS_RECRUITER_PASSWORD;
const databasePath = process.env.HIREOS_DB || resolve(dataDir, 'hireos.sqlite');
const store = openStore(databasePath, undefined, { seedDemo: !config.production });
const runRetention = async () => {
  try {
    const report = await store.purgeRejectedCv();
    logger.info('retention.completed', report);
  } catch (error) {
    logger.error('retention.failed', { error: error.message });
  }
};
await runRetention();
const stopCvWorker = startCvWorker(store, () => logger.error('processing.queue_failed'));
const keys = openKeys(databasePath);
const port = Number(process.env.PORT || 4310);
const handler = createHandler({
  store,
  keys,
  sessions,
  port,
  dataDir,
  secureCookie: config.secureCookie,
  production: config.production,
  revision,
});
const server = http.createServer((req, res) => {
  res.once('finish', () => {
    if (res.statusCode >= 500) {
      logger.error('http.5xx', { status: res.statusCode });
    }
  });
  return handler(req, res);
});
server.listen(port, '127.0.0.1', () =>
  logger.info('server.started', {
    url: `http://localhost:${port}`,
    mode: config.production ? 'produkcja' : 'lokalny prototyp',
  })
);
const stopRetention = startRetentionSchedule(runRetention);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () =>
    server.close(async () => {
      stopRetention();
      await stopCvWorker();
      store.close();
      keys.close();
      process.exit(0);
    })
  );
}
