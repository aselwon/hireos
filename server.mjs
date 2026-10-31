import { mkdir } from 'node:fs/promises';
import http from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRequestHandler } from './lib/http-handler.mjs';
import { openStore } from './lib/store.mjs';

const root = dirname(fileURLToPath(import.meta.url));
await mkdir(resolve(root, 'data'), { recursive: true });
const store = openStore(process.env.HIREOS_DB || resolve(root, 'data/hireos.sqlite'));
const port = Number(process.env.PORT || 4310);
const server = http.createServer(createRequestHandler({ store, port, root }));
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`HireOS: http://localhost:${port} — lokalny prototyp; dane fikcyjne\n`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    })
  );
}
