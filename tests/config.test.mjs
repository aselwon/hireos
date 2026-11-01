import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import { loadConfig } from '../lib/config.mjs';
import { createHandler } from '../lib/http.mjs';
import { openStore } from '../lib/store.mjs';

const password = 'synthetic-production-password';
const cloudEnv = {
  NODE_ENV: 'production',
  HIREOS_RECRUITER_PASSWORD: password,
  HIREOS_SECURE_COOKIE: '1',
  RETENTION_DAYS: '90',
  MODEL_PROVIDER: 'cloudflare',
  CF_ACCOUNT_ID: '2791466c5820cfd886aad95e0d3ef948',
  CF_AI_TOKEN: 'synthetic-token',
};

test('konfiguracja produkcyjna waliduje wymagane wartości bez ujawniania sekretów', () => {
  assert.equal(loadConfig({ ...cloudEnv }).production, true);
  for (const env of [
    { ...cloudEnv, HIREOS_RECRUITER_PASSWORD: '' },
    { ...cloudEnv, HIREOS_SECURE_COOKIE: '0' },
    { ...cloudEnv, RETENTION_DAYS: 'invalid' },
    { ...cloudEnv, MODEL_DAILY_NEURON_CAP: '9001' },
    { ...cloudEnv, MODEL_PROVIDER: 'fake' },
  ]) {
    assert.throws(
      () => loadConfig(env),
      (error) => {
        assert.match(error.message, /Konfiguracja produkcyjna/);
        assert.equal(error.message.includes(password), false);
        assert.equal(error.message.includes('synthetic-token'), false);
        return true;
      }
    );
  }
  assert.equal(loadConfig({ NODE_ENV: 'development' }).production, false);
});

test('błędna konfiguracja produkcyjna kończy start po polsku bez ujawniania sekretów', (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'hireos-invalid-config-'));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  for (const config of [
    { NODE_ENV: 'production', HIREOS_DATA_DIR: dataDir, HIREOS_RECRUITER_PASSWORD: '' },
    { ...cloudEnv, HIREOS_DATA_DIR: dataDir, MODEL_DAILY_NEURON_CAP: '9001' },
  ]) {
    const result = spawnSync(process.execPath, ['--experimental-sqlite', 'server.mjs'], {
      encoding: 'utf8',
      env: { ...process.env, ...config },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Konfiguracja produkcyjna/);
    assert.equal(result.stderr.includes(password), false);
    assert.equal(result.stderr.includes('synthetic-token'), false);
  }
});

test('tryb produkcyjny ukrywa endpointy i statyczny seed, a lokalny je udostępnia', async (t) => {
  const store = openStore(':memory:');
  t.after(() => store.close());
  const sessions = {
    valid: () => ({ id: 'test' }),
    login: () => ({ status: 200, token: 'synthetic-session' }),
  };
  const handlerFor = (production) =>
    createHandler({
      store,
      keys: { authenticate: () => null },
      sessions,
      port: 14313,
      production,
    });
  const request = async (handler, route, method = 'GET', payload) => {
    const req = Readable.from(payload ? [JSON.stringify(payload)] : []);
    req.method = method;
    req.url = route;
    req.headers = {
      host: '127.0.0.1:14313',
      ...(payload ? { 'content-type': 'application/json', 'idempotency-key': 'test-key' } : {}),
    };
    let status;
    let body;
    await handler(req, {
      setHeader() {
        return undefined;
      },
      writeHead(code) {
        status = code;
      },
      end(value) {
        body = value;
      },
    });
    return { status, body };
  };
  const production = handlerFor(true);
  for (const route of ['/api/state', '/seed.js']) {
    assert.equal((await request(production, route)).status, 404);
  }
  assert.equal((await request(production, '/api/pause', 'POST', { paused: true })).status, 404);
  assert.equal((await request(production, '/api/login', 'POST', { password })).status, 200);
  const local = handlerFor(false);
  assert.equal((await request(local, '/api/state')).status, 200);
  assert.equal((await request(local, '/seed.js')).status, 200);
  assert.equal((await request(local, '/api/pause', 'POST', { paused: true })).status, 200);
});
