import { mkdir } from 'node:fs/promises';
import http from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSessions, openKeys } from './lib/auth.mjs';
import { loadConfig } from './lib/config.mjs';
import { startCvWorker } from './lib/cv-queue.mjs';
import { createHandler } from './lib/http.mjs';
import { createLogger } from './lib/logger.mjs';
import { openStore } from './lib/store.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const logger = createLogger();
const dataDir = process.env.HIREOS_DATA_DIR || resolve(root, 'data');
await mkdir(dataDir, { recursive: true });
const sessions = createSessions(config.password);
delete process.env.HIREOS_RECRUITER_PASSWORD;
const databasePath = process.env.HIREOS_DB || resolve(dataDir, 'hireos.sqlite');
const store = openStore(databasePath, undefined, { seedDemo: !config.production });
await store.purgeRejectedCv();
const stopCvWorker = startCvWorker(store, () => logger.error('processing.queue_failed'));
const keys = openKeys(databasePath);
const port = Number(process.env.PORT || 4310);
const server = http.createServer(
  createHandler({
    store,
    keys,
    sessions,
    port,
    dataDir,
    secureCookie: config.secureCookie,
    production: config.production,
  })
);
server.listen(port, '127.0.0.1', () =>
  logger.info('server.started', {
    url: `http://localhost:${port}`,
    mode: config.production ? 'produkcja' : 'lokalny prototyp',
  })
);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () =>
    server.close(async () => {
      await stopCvWorker();
      store.close();
      keys.close();
      process.exit(0);
    })
  );
}
