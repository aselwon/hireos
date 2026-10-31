import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};
async function handleMutation(req, url, send, store, port) {
  if (
    req.headers.origin &&
    ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin)
  ) {
    return send(403, { error: 'Origin niedozwolony.' });
  }
  if (!req.headers['content-type']?.startsWith('application/json')) {
    return send(415, { error: 'Wymagany JSON.' });
  }
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 16000) {
      return send(413, { error: 'Zbyt duże żądanie.' });
    }
  }
  if (url.pathname === '/api/generate') {
    return send(200, await store.generate(JSON.parse(body), req.headers['idempotency-key']));
  }
  return send(
    200,
    store.mutate(url.pathname.slice(5), JSON.parse(body), req.headers['idempotency-key'])
  );
}
export function createRequestHandler({ store, port, root }) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (status, body) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(body));
    };
    // This server is intentionally a loopback-only demo, not an authenticated SaaS deployment.
    if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host)) {
      return send(403, { error: 'Host niedozwolony.' });
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
    try {
      if (url.pathname === '/api/state' && req.method === 'GET') {
        return send(200, store.read());
      }
      if (url.pathname.startsWith('/api/') && req.method === 'POST') {
        return await handleMutation(req, url, send, store, port);
      }
      if (url.pathname.startsWith('/api/')) {
        return send(404, { error: 'Nieznana ścieżka API.' });
      }
      if (req.method !== 'GET') {
        return send(405, { error: 'Metoda niedozwolona.' });
      }
      const allowed = {
        '/': 'index.html',
        '/index.html': 'index.html',
        '/app.js': 'app.js',
        '/seed.js': 'seed.js',
        '/styles.css': 'styles.css',
      };
      const file = allowed[url.pathname];
      if (!file) {
        return send(404, { error: 'Nie znaleziono.' });
      }
      const content = await readFile(resolve(root, 'hireos/dist', file));
      res.writeHead(200, { 'Content-Type': types[extname(file)], 'Cache-Control': 'no-cache' });
      return res.end(content);
    } catch (error) {
      return send(error.status || 400, { error: error.message });
    }
  };
}
