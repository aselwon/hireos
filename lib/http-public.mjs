const rateLimitFor = (pathname) => {
  if (pathname === '/api/login') {
    return { bucket: 'login', limit: 20, window: 15 * 60 * 1000 };
  }
  if (
    /^\/apply(?:\/|$)/.test(pathname) ||
    /^\/api\/v1\/briefs\/[^/]+\/applications$/.test(pathname)
  ) {
    return { bucket: 'apply', limit: 30, window: 60 * 1000 };
  }
  if (/^\/api\/(?:v1\/)?leads?$/.test(pathname)) {
    return { bucket: 'leads', limit: 10, window: 60 * 60 * 1000 };
  }
  return null;
};
export function serveOptOut(req, res, store, token) {
  if (req.method !== 'GET') {
    res.writeHead(405, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    return res.end('Metoda niedozwolona.');
  }
  const accepted = store.outreach.optOut(token);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  return res.end(
    `<!doctype html><html lang="pl"><meta charset="utf-8"><title>Rezygnacja z kontaktu</title><p>${accepted ? 'Rezygnacja z kontaktu została potwierdzona.' : 'Ten link jest nieprawidłowy lub został już użyty.'}</p></html>`
  );
}
export function createRateLimiter() {
  const rateLimits = new Map();
  return (req, pathname) => {
    const policy = rateLimitFor(pathname);
    if (!policy) {
      return false;
    }
    const now = Date.now();
    const key = `${policy.bucket}:${req.socket?.remoteAddress || 'unknown'}`;
    let entry = rateLimits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + policy.window };
      rateLimits.set(key, entry);
    }
    entry.count += 1;
    if (rateLimits.size > 10000) {
      for (const [item, value] of rateLimits) {
        if (value.resetAt <= now) {
          rateLimits.delete(item);
        }
      }
    }
    return entry.count > policy.limit;
  };
}
