import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGitHubSourcing } from './github-sourcing.mjs';
import { createApplicationRoutes } from './http-applications.mjs';
import { createBriefRoutes } from './http-briefs.mjs';
import { createDecisionRoute } from './http-decisions.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicPaths = [
  '/login',
  '/login.js',
  '/api/login',
  '/api/logout',
  '/apply.js',
  '/styles.css',
];
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
async function handleOutreachControl(store, req, url, principal, send, port, readInput) {
  if (req.method !== 'POST') {
    return null;
  }
  const recruitment = url.pathname.match(/^\/api\/v1\/briefs\/([^/]+)\/outreach-control$/);
  const application = url.pathname.match(/^\/api\/v1\/applications\/([^/]+)\/outreach-control$/);
  if (!recruitment && !application) {
    return null;
  }
  validateMutation(req, port);
  if (principal?.scope !== 'admin') {
    return send(403, { error: 'Niedozwolony zakres.' });
  }
  const input = await readInput(req);
  const result = recruitment
    ? store.outreach.setRecruitmentPause(recruitment[1], input)
    : store.outreach.setControl(application[1], input);
  return send(200, result);
}
function handleOutreachRead(store, pathname, principal, send) {
  const preflight = pathname.match(/^\/api\/v1\/tasks\/([^/]+)\/preflight$/);
  if (preflight) {
    return send(200, store.outreach.getPreflight(preflight[1], principal));
  }
  const task = pathname.match(/^\/api\/v1\/tasks(?:\/([^/]+))?$/);
  if (task) {
    return send(200, store.outreach.read(task[1], principal));
  }
  return null;
}
function handleReadRoutes(store, applicationRoutes, req, url, send, principal) {
  const outreach =
    req.method === 'GET' ? handleOutreachRead(store, url.pathname, principal, send) : null;
  if (outreach) {
    return outreach;
  }
  const applications = handleBriefApplications(store, applicationRoutes, req, url, send);
  if (applications) {
    return applications.response;
  }
  if (req.method !== 'GET') {
    return null;
  }
  const publicBrief = url.pathname.match(/^\/api\/v1\/public-briefs\/([^/]+)$/);
  if (publicBrief) {
    const brief = store.getBrief(publicBrief[1]);
    if (!brief || brief.status !== 'approved') {
      return send(404, { error: 'Nie znaleziono aktywnej rekrutacji.' });
    }
    return send(200, { title: brief.title, advertisement: brief.advertisement });
  }
  if (url.pathname === '/api/state') {
    return send(200, store.read());
  }
  if (url.pathname === '/api/v1/briefs') {
    return send(200, { briefs: store.listBriefs() });
  }
  return null;
}
async function handlePost(req, url, send, res, token, principal, routes) {
  const decisionResponse = await routes.decision(req, url.pathname, send, principal);
  if (decisionResponse) {
    return decisionResponse;
  }
  return url.pathname === '/api/v1/briefs'
    ? routes.briefs.create(req, send)
    : routes.mutate(req, url, send, res, token, principal);
}
function handleBriefApplications(store, applicationRoutes, req, url, send) {
  const match = url.pathname.match(/^\/api\/v1\/briefs\/([^/]+)\/applications$/);
  if (!match) {
    return null;
  }
  if (req.method === 'GET') {
    return { response: send(200, { applications: store.listApplications(match[1]) }) };
  }
  if (req.method === 'POST') {
    return { response: applicationRoutes.submit(req, match[1], send) };
  }
  return null;
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
  const decisionRoute = createDecisionRoute(store, (req) => validateMutation(req, port), readInput);
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
    const screeningMatch = url.pathname.match(/^\/api\/v1\/applications\/([^/]+)\/screening$/);
    if (screeningMatch) {
      return send(200, await store.generateScreening(screeningMatch[1], key));
    }
    if (url.pathname === '/api/generate') {
      return send(200, await store.generate(input, key));
    }
    return send(200, store.mutate(url.pathname.slice(5), input, key));
  }
  async function handleApi(req, url, send, res, token, principal) {
    const readResponse = handleReadRoutes(store, applicationRoutes, req, url, send, principal);
    if (readResponse) {
      return readResponse;
    }
    if (req.method === 'POST') {
      const controlResponse = await handleOutreachControl(
        store,
        req,
        url,
        principal,
        send,
        port,
        readInput
      );
      if (controlResponse) {
        return controlResponse;
      }
    }
    if (url.pathname.startsWith('/api/v1/briefs/')) {
      return briefRoutes.route(req, url, send);
    }
    if (req.method === 'POST') {
      return handlePost(req, url, send, res, token, principal, {
        decision: decisionRoute,
        briefs: briefRoutes,
        mutate: handleMutation,
      });
    }
    return send(404, { error: 'Nieznana ścieżka API.' });
  }
  function accessStatus(pathname, session, principal) {
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
      return true;
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
