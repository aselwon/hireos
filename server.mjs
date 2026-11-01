import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import http from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSessions, openKeys } from './lib/auth.mjs';
import { loadConfig } from './lib/config.mjs';
import { createHandler } from './lib/http.mjs';
import { createLogger } from './lib/logger.mjs';
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
const store = openStore(databasePath);
await store.purgeRejectedCv();
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
    revision,
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
    server.close(() => {
      store.close();
      keys.close();
      process.exit(0);
    })
  );
}
