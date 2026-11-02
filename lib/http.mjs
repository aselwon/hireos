import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGitHubSourcing } from './github-sourcing.mjs';
import { createApplicationRoutes } from './http-applications.mjs';
import { createBriefRoutes } from './http-briefs.mjs';
import { createDecisionRoute } from './http-decisions.mjs';
import { handleOutreachLive, handleOutreachSettings } from './http-outreach.mjs';
import { createRateLimiter, serveOptOut } from './http-public.mjs';
import { handleKeyRoutes, handleSettingsRoute, isApiKeyPath } from './http-settings.mjs';
import { handleShortlists, serveShortlist } from './http-shortlists.mjs';
import { mutateDemo, sendError, validateMutation } from './http-utils.mjs';
import { loadPrivacy, requirePrivacy, privacyPage, escapeHtml } from './legal/privacy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const publicPaths = [
  '/',
  '/company.js',
  '/company.css',
  '/privacy-firms',
  '/api/leads',
  '/login',
  '/login.js',
  '/api/login',
  '/api/logout',
  '/apply.js',
  '/styles.css',
];
const isTaskPath = (pathname) =>
  pathname === '/api/v1/tasks' || pathname.startsWith('/api/v1/tasks/');
function handleTaskMutation(store, pathname, input, key, principal, send, publicBaseUrl) {
  const match = pathname.match(
    /^\/api\/v1\/tasks(?:\/(claim)|\/([^/]+)\/(heartbeat|result|cancel))?$/
  );
  if (!match) {
    return send(404, { error: 'Nieznana ścieżka API.' });
  }
  const action = match[1] || match[3] || 'create';
  return send(
    action === 'create' ? 201 : 200,
    store.outreach.mutate(action, match[2] || null, input, key, principal, publicBaseUrl)
  );
}
async function handleBillingAndOutreach(
  store,
  sessions,
  req,
  url,
  send,
  principal,
  port,
  readInput
) {
  const billing = await handleBillingMutation(store, req, url, send, port, readInput, principal);
  if (billing) {
    return billing;
  }
  if (url.pathname === '/api/v1/outreach-live') {
    return handleOutreachLive(store, sessions, req, send, principal, port, readInput);
  }
  if (url.pathname === '/api/v1/outreach-settings') {
    return handleOutreachSettings(store, req, send, principal, port, readInput);
  }
  return null;
}
async function submitLead(req, send, store, port, readInput) {
  validateMutation(req, port);
  const input = await readInput(req);
  if (input?.website) {
    return send(202, { accepted: true });
  }
  return send(
    201,
    store.createLead(input, req.headers['idempotency-key'], req.socket?.remoteAddress)
  );
}
function authenticateRequest(req, sessions, keys) {
  const token = req.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('hireos_session='))
    ?.slice(15);
  const session = sessions.valid(token);
  const principal = session
    ? { id: 'recruiter-session', scope: 'admin', kind: 'session' }
    : keys.authenticate(req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1]);
  return { token, session, principal };
}
async function serveStatic(req, res, pathname, send, production, pricing) {
  if (req.method !== 'GET') {
    return send(405, { error: 'Metoda niedozwolona.' });
  }
  const allowed = {
    '/login': 'login.html',
    '/login.js': 'login.js',
    '/apply.js': 'apply.js',
    '/': 'company.html',
    '/index.html': 'index.html',
    '/company.js': 'company.js',
    '/company.css': 'company.css',
    '/privacy-firms': 'privacy-firms.html',
    '/app.js': 'app.js',
    '/report.js': 'report.js',
    '/clients.js': 'clients.js',
    '/shortlists.js': 'shortlists.js',
    '/seed.js': production ? null : 'seed.js',
    '/styles.css': 'styles.css',
  };
  const file = allowed[pathname];
  if (!file) {
    return send(404, { error: 'Nie znaleziono.' });
  }
  let content = await readFile(resolve(root, 'hireos/dist', file));
  if (pathname === '/') {
    content = content
      .toString()
      .replaceAll('{{pricing}}', escapeHtml(pricing.trim() || 'Wycena indywidualna'));
  }
  res.writeHead(200, {
    'Content-Type': contentTypes[extname(file)],
    'Cache-Control': 'no-store',
  });
  return res.end(content);
}
function rejectRequest(req, pathname, port, production, send) {
  if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host)) {
    return send(403, { error: 'Host niedozwolony.' });
  }
  if (production && ['/api/state', '/api/generate', '/seed.js'].includes(pathname)) {
    return send(404, { error: 'Nie znaleziono.' });
  }
  return null;
}
function setSecurityHeaders(res, production) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (production) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
}
function accessStatus(pathname, session, principal) {
  if (!publicPaths.includes(pathname) && !session) {
    const publicApplication =
      /^\/api\/v1\/briefs\/[^/]+\/applications$/.test(pathname) ||
      /^\/api\/v1\/public-briefs\/[^/]+$/.test(pathname) ||
      /^\/apply\/[^/]+$/.test(pathname) ||
      /^\/privacy\/[^/]+$/.test(pathname) ||
      /^\/s\/[^/]+(?:\/cv\/[^/]+)?$/.test(pathname) ||
      /^\/opt-out\/[A-Za-z0-9_-]+$/.test(pathname) ||
      pathname === '/privacy-firms';
    const sessionOnly =
      (!pathname.startsWith('/api/') && pathname !== '/') || pathname === '/api/state';
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
function handleBillingRead(store, pathname, principal, send, res) {
  if (pathname !== '/api/v1/billing/events.csv') {
    return null;
  }
  if (principal?.scope !== 'admin') {
    return send(403, { error: 'Niedozwolony zakres.' });
  }
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="billing-events.csv"',
    'Cache-Control': 'no-store',
  });
  res.end(store.exportBillingCsv());
  return true;
}
async function handleBillingMutation(store, req, url, send, port, readInput, principal) {
  if (req.method !== 'POST') {
    return null;
  }
  const status = url.pathname.match(/^\/api\/v1\/billing\/events\/([^/]+)\/status$/);
  if (url.pathname !== '/api/v1/billing/events' && !status) {
    return null;
  }
  validateMutation(req, port);
  const input = await readInput(req);
  const key = req.headers['idempotency-key'];
  return status
    ? send(
        200,
        store.updateBillingStatus(status[1], input, key, principal?.id || 'recruiter-session')
      )
    : send(201, { event: store.createBillingEvent(input, key) });
}
function handleReadRoutes(store, applicationRoutes, req, url, send, principal, res) {
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
  const billing = handleBillingRead(store, url.pathname, principal, send, res);
  if (billing) {
    return billing;
  }
  if (url.pathname === '/api/v1/audit/ai.csv') {
    if (principal?.scope !== 'admin') {
      return send(403, { error: 'Niedozwolony zakres.' });
    }
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ai-audit.csv"',
      'Cache-Control': 'no-store',
    });
    res.end(store.exportAiAudit());
    return true;
  }
  const report = url.pathname.match(/^\/api\/v1\/applications\/([^/]+)\/screening$/);
  if (report) {
    if (principal?.scope !== 'admin') {
      return send(403, { error: 'Niedozwolony zakres.' });
    }
    return send(200, store.markAiReportViewed(report[1], principal.id || 'recruiter-session'));
  }
  const publicBrief = url.pathname.match(/^\/api\/v1\/public-briefs\/([^/]+)$/);
  if (publicBrief) {
    const brief = store.getBrief(publicBrief[1]);
    if (!brief || brief.status !== 'approved') {
      return send(404, { error: 'Nie znaleziono aktywnej rekrutacji.' });
    }
    return send(200, { title: brief.title, advertisement: brief.advertisement });
  }
  const lists = {
    '/api/state': () => store.read(),
    '/api/v1/clients': () => ({ clients: store.listClients() }),
    '/api/v1/billing/events': () => ({ events: store.listBillingEvents() }),
    '/api/v1/leads': () => ({ leads: store.listLeads() }),
    '/api/v1/briefs': () => ({ briefs: store.listBriefs() }),
  };
  const list = lists[url.pathname];
  return list ? send(200, list()) : null;
}
async function handlePost(req, url, send, res, token, principal, routes) {
  const lead = url.pathname.match(/^\/api\/v1\/leads\/([^/]+)(?:\/(convert))?$/);
  if (lead) {
    validateMutation(req, routes.port);
    const input = await routes.readInput(req);
    return lead[2]
      ? send(201, {
          client: routes.store.convertLead(lead[1], input, req.headers['idempotency-key']),
        })
      : send(200, {
          lead: routes.store.updateLead(lead[1], input, req.headers['idempotency-key']),
        });
  }
  if (url.pathname === '/api/v1/clients') {
    return routes.briefs.createClient(req, send);
  }
  const decisionResponse = await routes.decision(req, url.pathname, send, principal);
  if (decisionResponse) {
    return decisionResponse.response;
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
async function handleDataRights(store, req, applicationId, send, principal, readInput, validate) {
  if (principal?.scope !== 'admin') {
    return send(403, { error: 'Niedozwolony zakres.' });
  }
  if (req.method === 'GET') {
    return send(200, { requests: store.dataRights.list(applicationId) });
  }
  if (req.method === 'POST') {
    validate(req);
    return send(
      200,
      store.dataRights.execute(applicationId, await readInput(req), req.headers['idempotency-key'])
    );
  }
  return send(405, { error: 'Metoda niedozwolona.' });
}
function sendHealth(store, revision, send) {
  try {
    const { schemaVersion, aiCapReached } = store.healthStatus();
    return send(200, { status: 'ok', revision, schemaVersion, db: 'ok', aiCapReached });
  } catch {
    return send(503, {
      status: 'unavailable',
      revision,
      schemaVersion: null,
      db: 'unavailable',
      aiCapReached: null,
    });
  }
}
const isHealthRequest = (req, url) => req.method === 'GET' && url.pathname === '/healthz';
function handleHealth(req, res, store, revision, port) {
  const send = (status, body) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(body));
  };
  if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host)) {
    return send(403, { error: 'Host niedozwolony.' });
  }
  return sendHealth(store, revision, send);
}
async function serveApplicationPage(req, res, pathname, privacy, production) {
  if (/^\/api\/v1\/(public-briefs\/[^/]+|briefs\/[^/]+\/applications)$/.test(pathname)) {
    requirePrivacy(privacy, production);
  }
  const match = pathname.match(/^\/(apply|privacy)\/([^/]+)$/);
  if (req.method !== 'GET' || !match) {
    return false;
  }
  let content;
  if (match[1] === 'privacy') {
    content = privacyPage(match[2], privacy);
  } else {
    requirePrivacy(privacy, production);
    content = (await readFile(resolve(root, 'hireos/dist', 'apply.html'), 'utf8')).replaceAll(
      '{{privacyVersion}}',
      escapeHtml(privacy.version)
    );
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(content);
  return true;
}
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
export function createHandler({
  store,
  keys,
  sessions,
  port,
  secureCookie = false,
  production = false,
  pricing = process.env.RECRUITMENT_PRICING || '',
  privacy = loadPrivacy(),
  sourceProfiles = createGitHubSourcing({ token: process.env.GITHUB_TOKEN }),
  dataDir = resolve(root, 'data'),
  revision = 'unknown',
}) {
  const briefRoutes = createBriefRoutes(store, port, readInput, sourceProfiles);
  const decisionRoute = createDecisionRoute(store, (req) => validateMutation(req, port), readInput);
  const applicationRoutes = createApplicationRoutes(store, dataDir, privacy);
  const rateLimited = createRateLimiter();
  async function handleMutation(req, url, send, res, token, principal) {
    validateMutation(req, port);
    const input = await readInput(req);
    const key = req.headers['idempotency-key'];
    if (isTaskPath(url.pathname)) {
      const baseUrl = (process.env.HIREOS_PUBLIC_URL || `http://localhost:${port}`).replace(
        /\/$/,
        ''
      );
      return handleTaskMutation(store, url.pathname, input, key, principal, send, baseUrl);
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
          : {
              error: 'Logowanie nieudane lub limit prób. Użyj nowego klucza po wygaśnięciu sesji.',
            }
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
    return mutateDemo(production, store, url.pathname.slice(5), input, key, send);
  }
  async function handleApi(req, url, send, res, token, principal) {
    if (url.pathname === '/api/v1/settings') {
      return handleSettingsRoute(req, send, principal, keys, store, privacy);
    }
    if (isApiKeyPath(url.pathname)) {
      return handleKeyRoutes(req, url, send, principal, keys, port, readInput);
    }
    const shortlistResponse = await handleShortlists(
      store,
      req,
      url,
      send,
      principal,
      readInput,
      (request) => validateMutation(request, port)
    );
    if (shortlistResponse) {
      return shortlistResponse;
    }
    const earlyResponse = await handleBillingAndOutreach(
      store,
      sessions,
      req,
      url,
      send,
      principal,
      port,
      readInput
    );
    if (earlyResponse) {
      return earlyResponse;
    }
    const rights = url.pathname.match(/^\/api\/v1\/applications\/([^/]+)\/data-rights$/);
    if (rights) {
      return handleDataRights(store, req, rights[1], send, principal, readInput, (request) =>
        validateMutation(request, port)
      );
    }
    const readResponse = handleReadRoutes(store, applicationRoutes, req, url, send, principal, res);
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
        port,
        readInput,
        store,
      });
    }
    return send(404, { error: 'Nieznana ścieżka API.' });
  }
  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (status, body) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(body));
      return true;
    };
    const rejection = rejectRequest(req, url.pathname, port, production, send);
    if (rejection) {
      return rejection;
    }
    setSecurityHeaders(res, production);
    try {
      const optOut = url.pathname.match(/^\/opt-out\/([A-Za-z0-9_-]+)$/);
      if (optOut) {
        return serveOptOut(req, res, store, optOut[1]);
      }
      if (rateLimited(req, url.pathname)) {
        return send(429, { error: 'Limit żądań osiągnięty. Spróbuj później.' });
      }
      const { token, session, principal } = authenticateRequest(req, sessions, keys);
      const denied = accessStatus(url.pathname, session, principal);
      if (denied) {
        return send(denied, {
          error: 'Wymagane logowanie lub odpowiedni zakres.',
          login: '/login',
        });
      }
      if (await serveShortlist(store, req, res, url.pathname, send)) {
        return null;
      }
      if (await serveApplicationPage(req, res, url.pathname, privacy, production)) {
        return null;
      }
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/leads') {
          return req.method === 'POST'
            ? await submitLead(req, send, store, port, readInput)
            : send(404, { error: 'Nieznana ścieżka API.' });
        }
        return await handleApi(req, url, send, res, token, principal);
      }
      return await serveStatic(req, res, url.pathname, send, production, pricing);
    } catch (error) {
      return sendError(send, error);
    }
  };
  return (req, res) =>
    isHealthRequest(req, new URL(req.url, 'http://localhost'))
      ? handleHealth(req, res, store, revision, port)
      : handler(req, res);
}
