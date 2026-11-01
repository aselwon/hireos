import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createSessions, openKeys } from '../lib/auth.mjs';
import { createHandler } from '../lib/http.mjs';
import { openStore } from '../lib/store.mjs';
import { runKeyCommand } from '../scripts/api-key.mjs';

const password = 'syntetyczne-haslo-testowe';
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'hireos-auth-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, path: join(dir, 'auth.sqlite') };
}

test('sesje: scrypt, limit globalny, idempotencja, wylogowanie i wygaśnięcie', () => {
  let now = 0;
  const sessions = createSessions(password, () => now);
  assert.throws(() => createSessions(''), /PASSWORD/);
  assert.equal(sessions.login(password).status, 400);
  const first = sessions.login(password, 'login');
  assert.equal(first.status, 200);
  assert.equal(sessions.valid(first.token), true);
  assert.deepEqual(sessions.login(password, 'login'), first);
  assert.equal(sessions.login('inne', 'login').status, 409);
  for (let i = 0; i < 3; i += 1) {
    assert.equal(sessions.login('błędne', `try-${i}`).status, 401);
  }
  assert.equal(sessions.login(password, 'blocked').status, 429);
  now += 15 * 60 * 1000;
  const next = sessions.login(password, 'next');
  assert.equal(next.status, 200);
  sessions.logout(first.token);
  sessions.logout(first.token);
  assert.equal(sessions.valid(first.token), false);
  assert.equal(sessions.login(password, 'login').status, 401);
  now += 8 * 60 * 60 * 1000;
  assert.equal(sessions.valid(next.token), false);
  assert.equal(createSessions(password).valid(next.token), false);
});

test('znany klucz idempotencji nie omija limitu i nie reaktywuje starego tokena', () => {
  let now = 0;
  const sessions = createSessions(password, () => now);
  const first = sessions.login(password, 'known');
  for (let i = 0; i < 4; i += 1) {
    assert.equal(sessions.login('błędne', 'known').status, 409);
  }
  assert.equal(sessions.login('błędne', 'known').status, 429);
  assert.equal(sessions.login(password, 'known').status, 429);
  now += 8 * 60 * 60 * 1000;
  const next = sessions.login(password, 'known');
  assert.equal(next.status, 200);
  assert.notEqual(first.token, next.token);
  assert.equal(sessions.valid(first.token), false);
  assert.equal(sessions.valid(next.token), true);
});

test('CLI ujawnia klucz tylko raz, baza zawiera wyłącznie hash, odwołanie jest trwałe', (t) => {
  const { dir, path } = fixture(t);
  const cli = (...args) => {
    let stdout = '';
    let stderr = '';
    const status = runKeyCommand(
      args,
      path,
      {
        write: (text) => {
          stdout += text;
        },
      },
      {
        write: (text) => {
          stderr += text;
        },
      }
    );
    return { status, stdout, stderr };
  };
  const created = cli('create', 'test-key', 'worker:outreach');
  assert.equal(created.status, 0, created.stderr);
  const token = created.stdout.trim();
  assert.match(token, /^hos_[\w-]{43}$/);
  assert.equal(created.stderr.includes(token), false);
  const retry = cli('create', 'test-key', 'worker:outreach');
  assert.equal(retry.status, 0);
  assert.equal(retry.stdout, '');
  assert.equal(cli('create', 'test-key', 'admin').status, 1);
  assert.equal(cli('create', 'bad-key', 'unknown').status, 1);
  const keys = openKeys(path);
  t.after(() => keys.close());
  assert.equal(keys.authenticate(token).scope, 'worker:outreach');
  assert.equal(keys.authenticate('invalid'), null);
  for (const file of readdirSync(dir)) {
    assert.equal(readFileSync(join(dir, file)).includes(Buffer.from(token)), false);
  }
  const db = new DatabaseSync(path);
  const row = db.prepare('SELECT * FROM api_keys').get();
  assert.match(row.key_hash, /^[a-f0-9]{64}$/);
  db.close();
  assert.equal(cli('revoke', 'test-key').status, 0);
  assert.equal(cli('revoke', 'test-key').status, 0);
  assert.equal(keys.authenticate(token), null);
  assert.equal(cli('create', 'test-key', 'worker:outreach').stdout, '');
});

test('HTTP chroni panel, stan i mutacje; sprawdza sesje, zakresy, odwołanie i origin', async (t) => {
  const { path } = fixture(t);
  const keys = openKeys(path);
  t.after(() => keys.close());
  const admin = keys.create('admin-test', 'admin');
  const worker = keys.create('worker-test', 'worker:outreach');
  const store = openStore(path);
  t.after(() => store.close());
  const handler = createHandler({
    store,
    keys,
    sessions: createSessions(password),
    port: 14312,
    secureCookie: true,
  });
  const request = async (route, options = {}) => {
    const req = Readable.from(options.body ? [options.body] : []);
    req.method = options.method || 'GET';
    req.url = route;
    req.headers = {
      host: '127.0.0.1:14312',
      ...Object.fromEntries(
        Object.entries(options.headers || {}).map(([key, value]) => [key.toLowerCase(), value])
      ),
    };
    const headers = new Map();
    let status;
    let body;
    await handler(req, {
      setHeader: (key, value) => headers.set(key.toLowerCase(), value),
      writeHead: (code, values) => {
        status = code;
        for (const [key, value] of Object.entries(values)) {
          headers.set(key.toLowerCase(), value);
        }
      },
      end: (value) => {
        body = value;
      },
    });
    for (const secret of [password, admin, worker]) {
      assert.equal(String(body).includes(secret), false);
    }
    return { status, headers, body };
  };
  for (const asset of ['/apply.js', '/styles.css']) {
    assert.equal((await request(asset)).status, 200);
  }
  const post = (body, extra = {}) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'http-test', ...extra },
    body: JSON.stringify(body),
  });
  for (const route of ['/', '/index.html', '/app.js', '/seed.js', '/api/state']) {
    assert.equal((await request(route)).status, 401);
    assert.equal(
      (await request(route, { headers: { Authorization: `Bearer ${admin}` } })).status,
      401
    );
  }
  assert.equal((await request('/login')).status, 200);
  assert.equal((await request('/login.js')).status, 200);
  assert.equal((await request('/api/pause', post({ paused: true }))).status, 401);
  assert.equal(
    (await request('/api/pause', post({ paused: true }, { Authorization: `Bearer ${worker}` })))
      .status,
    403
  );
  assert.equal(
    (await request('/api/pause', post({ paused: true }, { Authorization: `Bearer ${admin}` })))
      .status,
    200
  );
  keys.revoke('admin-test');
  assert.equal(
    (await request('/api/pause', post({ paused: true }, { Authorization: `Bearer ${admin}` })))
      .status,
    401
  );
  assert.equal(
    (await request('/api/login', post({ password }, { Origin: 'https://evil.example' }))).status,
    403
  );
  assert.equal((await request('/api/login', post({ password: 'błędne' }))).status, 401);
  const login = await request('/api/login', post({ password }));
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  for (const attribute of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Max-Age=28800']) {
    assert.ok(cookie.includes(attribute));
  }
  const auth = { Cookie: cookie.split(';')[0] };
  assert.equal((await request('/', { headers: auth })).status, 200);
  assert.equal((await request('/api/state', { headers: auth })).status, 200);
  assert.equal((await request('/api/logout', post({}, auth))).status, 200);
  assert.equal((await request('/api/logout', post({}, auth))).status, 200);
  assert.equal((await request('/api/state', { headers: auth })).status, 401);
});

test('publiczny healthz ujawnia wyłącznie stan techniczny i zgłasza niedostępną bazę', async (t) => {
  const { path } = fixture(t);
  const keys = openKeys(path);
  const store = openStore(path);
  t.after(() => keys.close());
  t.after(() => store.close());
  const handler = createHandler({
    store,
    keys,
    sessions: createSessions(password),
    port: 14313,
    revision: 'r-synthetic',
  });
  const request = async () => {
    const req = Readable.from([]);
    req.method = 'GET';
    req.url = '/healthz';
    req.headers = { host: '127.0.0.1:14313' };
    let status;
    let body;
    const headers = new Map();
    await handler(req, {
      setHeader: (key, value) => headers.set(key.toLowerCase(), value),
      writeHead(code) {
        status = code;
      },
      end(value) {
        body = value;
      },
    });
    return { status, body: JSON.parse(body) };
  };
  const healthy = await request();
  assert.equal(healthy.status, 200);
  assert.deepEqual(healthy.body, {
    status: 'ok',
    revision: 'r-synthetic',
    schemaVersion: 4,
    db: 'ok',
    aiCapReached: false,
  });
  assert.doesNotMatch(JSON.stringify(healthy.body), /candidate|email|\/|password|secret/i);
  t.mock.method(store, 'healthStatus', () => {
    throw new Error('database path and secret');
  });
  const unavailable = await request();
  assert.equal(unavailable.status, 503);
  assert.deepEqual(unavailable.body, {
    status: 'unavailable',
    revision: 'r-synthetic',
    schemaVersion: null,
    db: 'unavailable',
    aiCapReached: null,
  });
  assert.doesNotMatch(JSON.stringify(unavailable.body), /database path|secret/i);
});
