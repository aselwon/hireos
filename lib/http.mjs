import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function createHandler({ store, keys, sessions, port, secureCookie = false }) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
  };
  async function readInput(req) {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 16000) {
        throw new Error('Zbyt duże żądanie.');
      }
    }
    return JSON.parse(body);
  }
  async function handleMutation(req, url, send, res, token) {
    if (
      req.headers.origin &&
      ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin)
    ) {
      return send(403, { error: 'Origin niedozwolony.' });
    }
    if (!req.headers['content-type']?.startsWith('application/json')) {
      return send(415, { error: 'Wymagany JSON.' });
    }
    const input = await readInput(req);
    const key = req.headers['idempotency-key'];
    if (url.pathname === '/api/login') {
      const result = sessions.login(input?.password, key);
      if (result.token) {
        res.setHeader(
          'Set-Cookie',
          `hireos_session=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secureCookie ? '; Secure' : ''}`
        );
      }
      return send(
        result.status,
        result.status === 200
          ? { ok: true }
          : { error: 'Logowanie nieudane lub limit prób. Użyj nowego klucza po wygaśnięciu sesji.' }
      );
    }
    if (url.pathname === '/api/logout') {
      if (!key || key.length > 128) {
        return send(400, { error: 'Wymagany Idempotency-Key.' });
      }
      sessions.logout(token);
      res.setHeader('Set-Cookie', 'hireos_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
      return send(200, { ok: true });
    }
    return send(200, store.mutate(url.pathname.slice(5), input, key));
  }
  function accessStatus(req, pathname, session) {
    const publicPaths = ['/login', '/login.js', '/api/login', '/api/logout'];
    if (!publicPaths.includes(pathname) && !session) {
      const credential = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
      const principal = keys.authenticate(credential);
      const sessionOnly = !pathname.startsWith('/api/') || pathname === '/api/state';
      if (sessionOnly || !principal) {
        return 401;
      }
      if (principal.scope !== 'admin') {
        return 403;
      }
    }
    return null;
  }
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (status, body) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(body));
    };
    // Nasłuch wyłącznie lokalny; konfiguracja reverse proxy należy do wdrożenia.
    if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host)) {
      return send(403, { error: 'Host niedozwolony.' });
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
    try {
      const token = req.headers.cookie
        ?.split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('hireos_session='))
        ?.slice(15);
      const session = sessions.valid(token);
      const denied = accessStatus(req, url.pathname, session);
      if (denied) {
        return send(denied, {
          error: 'Wymagane logowanie lub odpowiedni zakres.',
          login: '/login',
        });
      }
      if (url.pathname === '/api/state' && req.method === 'GET') {
        return send(200, store.read());
      }
      if (url.pathname.startsWith('/api/') && req.method === 'POST') {
        return await handleMutation(req, url, send, res, token);
      }
      if (url.pathname.startsWith('/api/')) {
        return send(404, { error: 'Nieznana ścieżka API.' });
      }
      if (req.method !== 'GET') {
        return send(405, { error: 'Metoda niedozwolona.' });
      }
      const allowed = {
        '/login': 'login.html',
        '/login.js': 'login.js',
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
      res.writeHead(200, { 'Content-Type': types[extname(file)], 'Cache-Control': 'no-store' });
      return res.end(content);
    } catch (error) {
      return send(400, {
        error: error instanceof SyntaxError ? 'Niepoprawny JSON.' : error.message,
      });
    }
  };
}
