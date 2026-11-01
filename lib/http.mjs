import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGitHubSourcing } from './github-sourcing.mjs';
import { createApplicationRoutes } from './http-applications.mjs';
import { createBriefRoutes } from './http-briefs.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isTaskPath = (pathname) =>
  pathname === '/api/v1/tasks' || pathname.startsWith('/api/v1/tasks/');
function handleTaskMutation(store, pathname, input, key, principal, send) {
  const match = pathname.match(/^\/api\/v1\/tasks(?:\/(claim)|\/([^/]+)\/(heartbeat|result))?$/);
  if (!match) {
    return send(404, { error: 'Nieznana ścieżka API.' });
  }
  const action = match[1] || match[3] || 'create';
  return send(
    action === 'create' ? 201 : 200,
    store.outreach.mutate(action, match[2] || null, input, key, principal)
  );
}
function validateMutation(req, port) {
  if (
    req.headers.origin &&
    ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin)
  ) {
    throw Object.assign(new Error('Origin niedozwolony.'), { status: 403 });
  }
  if (!req.headers['content-type']?.startsWith('application/json')) {
    throw Object.assign(new Error('Wymagany JSON.'), { status: 415 });
  }
}
export function createHandler({
  store,
  keys,
  sessions,
  port,
  secureCookie = false,
  sourceProfiles = createGitHubSourcing({ token: process.env.GITHUB_TOKEN }),
  dataDir = resolve(root, 'data'),
}) {
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
  const briefRoutes = createBriefRoutes(store, port, readInput, sourceProfiles);
  const applicationRoutes = createApplicationRoutes(store, dataDir);
  async function handleMutation(req, url, send, res, token, principal) {
    validateMutation(req, port);
    const input = await readInput(req);
    const key = req.headers['idempotency-key'];
    if (isTaskPath(url.pathname)) {
      return handleTaskMutation(store, url.pathname, input, key, principal, send);
    }
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
    const cvMatch = url.pathname.match(/^\/api\/v1\/applications\/([^/]+)\/parse-cv$/);
    if (cvMatch) {
      return send(200, await store.parseCv(cvMatch[1], key));
    }
    if (url.pathname === '/api/generate') {
      return send(200, await store.generate(input, key));
    }
    return send(200, store.mutate(url.pathname.slice(5), input, key));
  }
  function handlePost(req, url, send, res, token, principal) {
    return url.pathname === '/api/v1/briefs'
      ? briefRoutes.create(req, send)
      : handleMutation(req, url, send, res, token, principal);
  }
  function handleApi(req, url, send, res, token, principal) {
    const taskRead = url.pathname.match(/^\/api\/v1\/tasks(?:\/([^/]+))?$/);
    if (taskRead && req.method === 'GET') {
      return send(200, store.outreach.read(taskRead[1], principal));
    }
    const applicationMatch = url.pathname.match(/^\/api\/v1\/briefs\/([^/]+)\/applications$/);
    if (applicationMatch && req.method === 'POST') {
      return applicationRoutes.submit(req, applicationMatch[1], send);
    }
    const publicBriefMatch = url.pathname.match(/^\/api\/v1\/public-briefs\/([^/]+)$/);
    if (publicBriefMatch && req.method === 'GET') {
      const brief = store.getBrief(publicBriefMatch[1]);
      if (!brief || brief.status !== 'approved') {
        return send(404, { error: 'Nie znaleziono aktywnej rekrutacji.' });
      }
      return send(200, { title: brief.title, advertisement: brief.advertisement });
    }
    if (url.pathname === '/api/state' && req.method === 'GET') {
      return send(200, store.read());
    }
    if (url.pathname === '/api/v1/briefs' && req.method === 'GET') {
      return send(200, { briefs: store.listBriefs() });
    }
    if (url.pathname.startsWith('/api/v1/briefs/')) {
      return briefRoutes.route(req, url, send);
    }
    if (req.method === 'POST') {
      return handlePost(req, url, send, res, token, principal);
    }
    return send(404, { error: 'Nieznana ścieżka API.' });
  }
  function accessStatus(pathname, session, principal) {
    const publicPaths = ['/login', '/login.js', '/api/login', '/api/logout'];
    if (!publicPaths.includes(pathname) && !session) {
      const publicApplication =
        /^\/api\/v1\/briefs\/[^/]+\/applications$/.test(pathname) ||
        /^\/api\/v1\/public-briefs\/[^/]+$/.test(pathname) ||
        /^\/apply\/[^/]+$/.test(pathname);
      const sessionOnly = !pathname.startsWith('/api/') || pathname === '/api/state';
      if (publicApplication) {
        return null;
      }
      if (sessionOnly || !principal) {
        return 401;
      }
      const taskPath = isTaskPath(pathname);
      if (principal.scope !== 'admin' && !(principal.scope === 'worker:outreach' && taskPath)) {
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
      const principal = session
        ? { id: 'recruiter-session', scope: 'admin' }
        : keys.authenticate(req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1]);
      const denied = accessStatus(url.pathname, session, principal);
      if (denied) {
        return send(denied, {
          error: 'Wymagane logowanie lub odpowiedni zakres.',
          login: '/login',
        });
      }
      if (url.pathname.startsWith('/api/')) {
        return await handleApi(req, url, send, res, token, principal);
      }
      if (req.method !== 'GET') {
        return send(405, { error: 'Metoda niedozwolona.' });
      }
      const allowed = {
        '/login': 'login.html',
        '/login.js': 'login.js',
        '/apply.js': 'apply.js',
        '/': 'index.html',
        '/index.html': 'index.html',
        '/app.js': 'app.js',
        '/seed.js': 'seed.js',
        '/styles.css': 'styles.css',
      };
      const applicationPage = url.pathname.match(/^\/apply\/([^/]+)$/);
      if (applicationPage) {
        const content = await readFile(resolve(root, 'hireos/dist', 'apply.html'));
        res.writeHead(200, { 'Content-Type': types['.html'], 'Cache-Control': 'no-store' });
        return res.end(content);
      }
      const file = allowed[url.pathname];
      if (!file) {
        return send(404, { error: 'Nie znaleziono.' });
      }
      const content = await readFile(resolve(root, 'hireos/dist', file));
      res.writeHead(200, { 'Content-Type': types[extname(file)], 'Cache-Control': 'no-store' });
      return res.end(content);
    } catch (error) {
      return send(error instanceof SyntaxError ? 400 : error.status || 400, {
        error: error instanceof SyntaxError ? 'Niepoprawny JSON.' : error.message,
      });
    }
  };
}
