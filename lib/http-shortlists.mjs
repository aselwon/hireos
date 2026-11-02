import { readFile } from 'node:fs/promises';

import { escapeHtml } from './legal/privacy.mjs';

export async function serveShortlist(store, req, res, pathname, send) {
  const match = pathname.match(/^\/s\/([^/]+)(?:\/cv\/([^/]+))?$/);
  if (!match) {
    return false;
  }
  if (req.method !== 'GET') {
    send(405, { error: 'Metoda niedozwolona.' });
    return true;
  }
  const result = store.shortlists.open(match[1], match[2]);
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (match[2]) {
    let content;
    try {
      content = await readFile(result.storagePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      send(404, { error: 'Nie znaleziono CV.' });
      return true;
    }
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="CV.pdf"',
      'Cache-Control': 'no-store',
    });
    res.end(content);
    return true;
  }
  const candidates = result.candidates
    .map((candidate, index) => {
      const name = escapeHtml(candidate.name ?? `Kandydat ${index + 1}`);
      const email = candidate.email ? `<p>${escapeHtml(candidate.email)}</p>` : '';
      const cv = candidate.cvPath
        ? `<p><a href="${escapeHtml(candidate.cvPath)}">Pobierz CV</a></p>`
        : '';
      return `<li><h2>${name}</h2>${email}${cv}</li>`;
    })
    .join('');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(
    `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Shortlista — HireOS</title><link rel="stylesheet" href="/styles.css"></head><body><main class="application"><h1>${escapeHtml(result.title)} — shortlista</h1><p>Dane poufne. Link przeznaczony wyłącznie dla zleceniodawcy rekrutacji. Nie przekazuj go dalej.</p><ol>${candidates}</ol></main></body></html>`
  );
  return true;
}

export async function handleShortlists(store, req, url, send, principal, readInput, validate) {
  const list = url.pathname === '/api/v1/shortlists';
  const revoke = url.pathname.match(/^\/api\/v1\/shortlists\/([^/]+)\/revoke$/);
  if (!list && !revoke) {
    return false;
  }
  if (principal?.scope !== 'admin') {
    return send(403, { error: 'Niedozwolony zakres.' });
  }
  if (list && req.method === 'GET') {
    return send(200, { shortlists: store.shortlists.list(url.searchParams.get('briefId')) });
  }
  if (req.method !== 'POST') {
    return send(405, { error: 'Metoda niedozwolona.' });
  }
  validate(req);
  const input = await readInput(req);
  const key = req.headers['idempotency-key'];
  const actor = principal.id || 'recruiter';
  return revoke
    ? send(200, store.shortlists.revoke(revoke[1], key, actor))
    : send(201, store.shortlists.create(input, key, actor));
}
