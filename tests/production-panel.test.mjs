import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createSessions, openKeys } from '../lib/auth.mjs';
import { createHandler } from '../lib/http.mjs';
import { openStore } from '../lib/store.mjs';

test('production recruiter panel loads from an empty SQLite database without demo assets', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'hireos-production-panel-'));
  const database = join(directory, 'hireos.sqlite');
  const store = openStore(database, undefined, { seedDemo: false });
  const keys = openKeys(database);
  const db = new DatabaseSync(database, { readOnly: true });
  t.after(async () => {
    db.close();
    keys.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  const port = 4310;
  const handler = createHandler({
    store,
    keys,
    sessions: createSessions('synthetic-password'),
    port,
    production: true,
    dataDir: directory,
  });
  const request = async (url, { method = 'GET', body, cookie } = {}) => {
    const req = Readable.from(body ? [JSON.stringify(body)] : []);
    req.method = method;
    req.url = url;
    req.headers = {
      host: `127.0.0.1:${port}`,
      ...(body ? { 'content-type': 'application/json', 'idempotency-key': 'panel-login' } : {}),
      ...(cookie ? { cookie } : {}),
    };
    let status;
    const responseHeaders = {};
    let responseBody;
    await handler(req, {
      setHeader(name, value) {
        responseHeaders[name.toLowerCase()] = value;
      },
      writeHead(code) {
        status = code;
      },
      end(value) {
        responseBody = value;
      },
    });
    return { status, headers: responseHeaders, body: responseBody };
  };

  assert.equal(db.prepare('SELECT count(*) AS total FROM workspace').get().total, 0);
  const login = await request('/api/login', {
    method: 'POST',
    body: { password: 'synthetic-password' },
  });
  assert.equal(login.status, 200);
  const [cookie] = login.headers['set-cookie'].split(';');
  const panel = await request('/', { cookie });
  assert.equal(panel.status, 200);
  const app = await request('/app.js', { cookie });
  assert.equal(app.status, 200);
  const appSource = app.body.toString();
  assert.match(appSource, /\/api\/v1\/briefs/);
  assert.doesNotMatch(appSource, /localStorage|sessionStorage|seed\.js/);
  const clientsModule = await request('/clients.js', { cookie });
  assert.equal(clientsModule.status, 200);
  assert.match(clientsModule.body.toString(), /Klienci firmowi/);
  const clients = await request('/api/v1/clients', { cookie });
  assert.equal(clients.status, 200);
  assert.deepEqual(JSON.parse(clients.body), { clients: [] });
  const seed = await request('/seed.js', { cookie });
  assert.equal(seed.status, 404);
  const briefs = await request('/api/v1/briefs', { cookie });
  assert.equal(briefs.status, 200);
  assert.deepEqual(JSON.parse(briefs.body), { briefs: [] });
});
