import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createSessions, openKeys } from '../lib/auth.mjs';
import { createHandler } from '../lib/http.mjs';
import { openStore } from '../lib/store.mjs';

test('API briefów waliduje dane, zapisuje je, odczytuje i obsługuje idempotencję', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hireos-briefs-'));
  const path = join(dir, 'briefs.sqlite');
  const keys = openKeys(path);
  const store = openStore(path);
  t.after(() => {
    keys.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const token = keys.create('brief-admin', 'admin');
  const handler = createHandler({
    store,
    keys,
    sessions: createSessions('synthetic-password'),
    port: 14313,
  });
  const request = async (route, method, payload, key = 'brief-key') => {
    const req = Readable.from(payload === undefined ? [] : [JSON.stringify(payload)]);
    req.method = method;
    req.url = route;
    req.headers = {
      host: '127.0.0.1:14313',
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
  const brief = {
    title: 'Backend Developer',
    stack: ['Node.js', 'PostgreSQL'],
    seniority: 'senior',
    salary: { min: 20000, max: 25000, currency: 'PLN', basis: 'net', contractType: 'b2b' },
    location: 'Warszawa',
    remote: false,
  };
  const created = await request('/api/v1/briefs', 'POST', brief);
  assert.equal(created.status, 201);
  assert.equal(
    (await request('/api/v1/briefs', 'POST', brief)).body.brief.id,
    created.body.brief.id
  );
  assert.equal((await request('/api/v1/briefs', 'GET')).body.briefs.length, 1);
  const applications = await request(`/api/v1/briefs/${created.body.brief.id}/applications`, 'GET');
  assert.equal(applications.status, 200);
  assert.deepEqual(applications.body.applications, []);
  assert.equal(store.listBriefs()[0].salary_max, 25000);
  const invalidTitle = await request(
    '/api/v1/briefs',
    'POST',
    { ...brief, title: ' ' },
    'bad-title'
  );
  assert.equal(invalidTitle.status, 400);
  assert.match(invalidTitle.body.error, /Stanowisko/);
  for (const invalid of [
    { ...brief, stack: [] },
    { ...brief, stack: ['LinkedIn Scraping'] },
    { ...brief, seniority: 'intern' },
    { ...brief, salary: { ...brief.salary, min: 26000 } },
    { ...brief, salary: { ...brief.salary, currency: 'XYZ' } },
    { ...brief, remote: false, location: '' },
  ]) {
    const result = await request('/api/v1/briefs', 'POST', invalid, crypto.randomUUID());
    assert.equal(result.status, 400);
    assert.equal(typeof result.body.error, 'string');
  }
  const conflict = await request('/api/v1/briefs', 'POST', { ...brief, title: 'Inny tytuł' });
  assert.equal(conflict.status, 400);
  assert.equal((await request('/api/v1/briefs', 'GET')).body.briefs.length, 1);
});
