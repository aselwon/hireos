import { mkdir } from 'node:fs/promises';
import http from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSessions, openKeys } from './lib/auth.mjs';
import { createHandler } from './lib/http.mjs';
import { openStore } from './lib/store.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.HIREOS_DATA_DIR || resolve(root, 'data');
await mkdir(dataDir, { recursive: true });
const sessions = createSessions(process.env.HIREOS_RECRUITER_PASSWORD);
delete process.env.HIREOS_RECRUITER_PASSWORD;
const databasePath = process.env.HIREOS_DB || resolve(dataDir, 'hireos.sqlite');
const store = openStore(databasePath);
const keys = openKeys(databasePath);
const port = Number(process.env.PORT || 4310);
const server = http.createServer(
  createHandler({
    store,
    keys,
    sessions,
    port,
    dataDir,
    secureCookie: process.env.HIREOS_SECURE_COOKIE === '1',
  })
);
server.listen(port, '127.0.0.1', () =>
  process.stdout.write(`HireOS: http://localhost:${port} — lokalny prototyp; dane fikcyjne\n`)
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
