import { validateMutation } from './http-utils.mjs';

export async function handleKeyRoutes(req, url, send, principal, keys, port, readInput) {
  if (principal?.scope !== 'admin') {
    return send(403, { error: 'Niedozwolony zakres.' });
  }
  if (req.method !== 'POST') {
    return send(405, { error: 'Metoda niedozwolona.' });
  }
  validateMutation(req, port);
  if (url.pathname === '/api/v1/api-keys') {
    const input = await readInput(req);
    return send(201, {
      id: input.id,
      scope: input.scope,
      secret: keys.create(input.id, input.scope),
    });
  }
  keys.revoke(decodeURIComponent(url.pathname.split('/').at(-1)));
  return send(200, { ok: true });
}
export function handleSettingsRoute(req, send, principal, keys, store, privacy) {
  if (principal?.scope !== 'admin') {
    return send(403, { error: 'Niedozwolony zakres.' });
  }
  if (req.method !== 'GET') {
    return send(405, { error: 'Metoda niedozwolona.' });
  }
  return send(200, {
    keys: keys.list(),
    outreach: store.outreach.readSettings(),
    privacy: { days: privacy.days, version: privacy.version },
    modelUsage: store.modelUsage(),
  });
}
export function isApiKeyPath(pathname) {
  return pathname === '/api/v1/api-keys' || /^\/api\/v1\/api-keys\/[^/]+$/.test(pathname);
}
