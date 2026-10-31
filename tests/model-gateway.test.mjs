import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { migrate } from '../lib/migrations.mjs';
import { createModelGateway } from '../lib/model-gateway.mjs';
import { defaultModel } from '../lib/model-providers.mjs';

const input = { prompt: 'Syntetyczny brief IT', maxTokens: 1 };
const cloudEnv = {
  MODEL_PROVIDER: 'cloudflare',
  CF_ACCOUNT_ID: '2791466c5820cfd886aad95e0d3ef948',
  CF_AI_TOKEN: 'synthetic-test-token',
};
function database(t, path = ':memory:') {
  const db = new DatabaseSync(path);
  migrate(db);
  t.after(() => db.close());
  return db;
}
const success = () =>
  Response.json({
    success: true,
    result: { response: 'Demo', usage: { prompt_tokens: 8, completion_tokens: 1 } },
  });

test('fake never fetches; exact cap, idempotency and UTC reset', async (t) => {
  t.mock.method(globalThis, 'fetch', () => {
    throw new Error('Sieć zabroniona');
  });
  const db = database(t);
  let date = new Date('2026-10-31T23:59:59Z');
  const gateway = createModelGateway(db, { env: { MODEL_DAILY_NEURON_CAP: '2' }, now: () => date });
  const first = await gateway.generate(input, 'one');
  assert.equal(first.estimatedNeurons, 2);
  assert.deepEqual(await gateway.generate(input, 'one'), first);
  await assert.rejects(gateway.generate({ ...input, prompt: 'Inne' }, 'one'), { status: 409 });
  await assert.rejects(gateway.generate(input, 'two'), { status: 503 });
  date = new Date('2026-11-01T00:00:00Z');
  assert.deepEqual(await gateway.generate(input, 'two'), first);
  assert.equal(db.prepare('SELECT SUM(estimated_neurons) AS used FROM model_calls').get().used, 4);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('recorded Workers AI limit blocks other keys across connections until UTC reset', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hireos-model-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = database(t, join(dir, 'db.sqlite'));
  let date = new Date('2026-10-31T20:00:00Z');
  let calls = 0;
  const fetchImpl = () => {
    calls += 1;
    return calls === 1
      ? Response.json(
          JSON.parse(readFileSync(new URL('./fixtures/workers-ai-limit.json', import.meta.url))),
          { status: 429 }
        )
      : success();
  };
  const options = { env: cloudEnv, now: () => date, fetchImpl };
  await assert.rejects(createModelGateway(db, options).generate(input, 'limit'), { status: 503 });
  const second = createModelGateway(database(t, join(dir, 'db.sqlite')), options);
  await assert.rejects(second.generate(input, 'blocked'), { status: 503 });
  assert.equal(calls, 1);
  date = new Date('2026-11-01T00:00:00Z');
  await second.generate(input, 'next-day');
  assert.equal(calls, 2);
  const row = db.prepare("SELECT * FROM model_calls WHERE idempotency_key='next-day'").get();
  assert.equal(row.input_tokens, 8);
  assert.equal(row.output_tokens, 1);
  assert.equal(row.tokens_estimated, 0);
  assert.equal(row.estimated_neurons, 2);
});

test('reservation serializes concurrent requests and retries without sending twice', async (t) => {
  const db = database(t);
  let finish;
  let count = 0;
  const gateway = createModelGateway(db, {
    env: { ...cloudEnv, MODEL_DAILY_NEURON_CAP: '2' },
    fetchImpl: () => {
      count += 1;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  const pending = gateway.generate(input, 'pending');
  await assert.rejects(gateway.generate(input, 'other'), { status: 503 });
  await assert.rejects(gateway.generate(input, 'pending'), { status: 503 });
  finish(success());
  await pending;
  assert.equal(count, 1);
});

test('allowlist, account, cap and CI validation fail closed', async (t) => {
  const db = database(t);
  const gateway = createModelGateway(db, { env: {} });
  for (const model of ['@cf/unknown/paid', 'toString']) {
    await assert.rejects(gateway.generate({ ...input, model }, 'bad'), { status: 400 });
  }
  for (const cap of ['0', '-1', '9001', 'Infinity', 'abc', '1.5', '']) {
    assert.throws(() => createModelGateway(db, { env: { MODEL_DAILY_NEURON_CAP: cap } }));
  }
  for (const env of [
    { MODEL_PROVIDER: 'other' },
    { ...cloudEnv, CF_ACCOUNT_ID: 'other' },
    { ...cloudEnv, CI: 'true' },
    { ...cloudEnv, NODE_ENV: 'test' },
  ]) {
    assert.throws(() => createModelGateway(db, { env }));
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM model_calls').get().n, 0);
});

test('REST contract, safe errors and failed reservation are persistent', async (t) => {
  const db = database(t);
  let calls = 0;
  const gateway = createModelGateway(db, {
    env: cloudEnv,
    fetchImpl: (url, options) => {
      calls += 1;
      assert.equal(
        url,
        `https://api.cloudflare.com/client/v4/accounts/${cloudEnv.CF_ACCOUNT_ID}/ai/run/${defaultModel}`
      );
      assert.equal(options.redirect, 'error');
      assert.equal(JSON.parse(options.body).max_tokens, 1);
      throw new Error('synthetic-test-token');
    },
  });
  await assert.rejects(
    gateway.generate(input, 'failure'),
    (error) => error.status === 503 && !error.message.includes(cloudEnv.CF_AI_TOKEN)
  );
  await assert.rejects(gateway.generate(input, 'retry'), { status: 503 });
  assert.equal(calls, 1);
  assert.equal(db.prepare('SELECT estimated_neurons FROM model_calls').get().estimated_neurons, 2);
});

test('MVP-01 database migrates existing model call without losing usage', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(
    'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)'
  );
  for (const [version, name] of [
    [1, '001-demo.sql'],
    [2, '002-mvp.sql'],
  ]) {
    db.exec(readFileSync(new URL(`../lib/migrations/${name}`, import.meta.url), 'utf8'));
    db.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?)').run(version, name, '2026-10-30');
  }
  db.exec(
    "INSERT INTO model_calls (id, provider, model, purpose, estimated_neurons, status, idempotency_key) VALUES ('old', 'fake', 'demo', 'test', 17, 'completed', 'old')"
  );
  migrate(db);
  migrate(db);
  const row = db.prepare('SELECT * FROM model_calls').get();
  assert.equal(row.estimated_neurons, 17);
  assert.equal(row.fingerprint, null);
  assert.equal(row.tokens_estimated, 1);
});
