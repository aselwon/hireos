import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createSessions, openKeys } from '../lib/auth.mjs';
import { createGitHubSourcing } from '../lib/github-sourcing.mjs';
import { createHandler } from '../lib/http.mjs';
import { openStore } from '../lib/store.mjs';

const recording = (status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(headers),
  json: async () =>
    JSON.parse(await readFile(new URL('./fixtures/github-users.json', import.meta.url))),
});

test('wyszukiwanie GitHub używa query language/location i uzasadnia dopasowania', async () => {
  let request;
  const source = createGitHubSourcing({
    token: 'synthetic-token',
    fetchImpl: (...args) => {
      request = args;
      return Promise.resolve(recording(200, { 'x-ratelimit-remaining': '58' }));
    },
  });
  const result = await source({ language: 'Node.js', location: 'Warszawa' });
  const url = new URL(request[0]);
  assert.equal(url.searchParams.get('q'), 'language:Node.js location:Warszawa');
  assert.equal(request[1].headers.Authorization, 'Bearer synthetic-token');
  assert.deepEqual(result.profiles[0], {
    login: 'synthetic-dev',
    url: 'https://github.com/synthetic-dev',
    score: 1,
    reasons: ['język: Node.js', 'lokalizacja: Warszawa'],
  });
});

test('osiągnięty limit GitHub nie zwraca wyników', async () => {
  const source = createGitHubSourcing({
    fetchImpl: () => Promise.resolve(recording(403, { 'x-ratelimit-remaining': '0' })),
  });
  await assert.rejects(source({ language: 'Node.js', location: 'Warszawa' }), {
    status: 429,
    message: /Limit GitHub API/,
  });
});

test('sourcing zatwierdzonego briefu nie tworzy zadań outreach', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hireos-github-'));
  const path = join(dir, 'hireos.sqlite');
  const keys = openKeys(path);
  const store = openStore(path);
  const db = new DatabaseSync(path);
  t.after(() => {
    db.close();
    keys.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const token = keys.create('github-admin', 'admin');
  const handler = createHandler({
    store,
    keys,
    sessions: createSessions('synthetic-password'),
    port: 14314,
    sourceProfiles: createGitHubSourcing({ fetchImpl: () => Promise.resolve(recording()) }),
  });
  const request = async (route, method, payload, key) => {
    const req = Readable.from(payload === undefined ? [] : [JSON.stringify(payload)]);
    req.method = method;
    req.url = route;
    req.headers = {
      host: '127.0.0.1:14314',
      authorization: `Bearer ${token}`,
      ...(payload === undefined
        ? {}
        : { 'content-type': 'application/json', 'idempotency-key': key }),
    };
    let status;
    let body;
    await handler(req, {
      setHeader(name, value) {
        req.responseHeaders ??= {};
        req.responseHeaders[name] = value;
      },
      writeHead(code) {
        status = code;
      },
      end(value) {
        body = value;
      },
    });
    return { status, body: body ? JSON.parse(body) : null };
  };
  const brief = await request(
    '/api/v1/briefs',
    'POST',
    {
      title: 'Backend Developer',
      stack: ['Node.js'],
      seniority: 'senior',
      salary: { min: 20000, max: 25000, currency: 'PLN', basis: 'net', contractType: 'b2b' },
      location: 'Warszawa',
      remote: false,
    },
    'create-brief'
  );
  const { id } = brief.body.brief;
  await request(
    `/api/v1/briefs/${id}/content`,
    'PUT',
    {
      advertisement: 'Syntetyczne ogłoszenie',
      requirements: [{ description: 'Node.js', priority: 'must', weight: 3 }],
    },
    'save-content'
  );
  await request(`/api/v1/briefs/${id}/approve`, 'POST', {}, 'approve-brief');
  const before = db.prepare('SELECT COUNT(*) AS count FROM outreach_tasks').get().count;
  const sourced = await request(`/api/v1/briefs/${id}/source`, 'POST', {}, 'source-brief');
  const after = db.prepare('SELECT COUNT(*) AS count FROM outreach_tasks').get().count;
  assert.equal(sourced.status, 200);
  assert.equal(sourced.body.profiles[0].login, 'synthetic-dev');
  assert.equal(after, before);
});
