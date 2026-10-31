import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createRequestHandler } from '../lib/http-handler.mjs';
import { openStore } from '../lib/store.mjs';

async function post(handler, key) {
  const req = Readable.from([JSON.stringify({ prompt: 'Demo', maxTokens: 1 })]);
  Object.assign(req, {
    url: '/api/generate',
    method: 'POST',
    headers: {
      host: 'localhost:4310',
      'content-type': 'application/json',
      'idempotency-key': key,
    },
  });
  let status;
  let body;
  await handler(req, {
    setHeader(name, value) {
      assert.equal(typeof value, 'string');
      assert.ok(name);
    },
    writeHead(value) {
      status = value;
    },
    end(value) {
      body = JSON.parse(value);
    },
  });
  return { status, body };
}

test('generation HTTP handler returns 503 after cap and 200 for cached retry with fetch disabled', async (t) => {
  t.mock.method(globalThis, 'fetch', () => {
    throw new Error('Sieć zabroniona');
  });
  const store = openStore(':memory:', { env: { MODEL_DAILY_NEURON_CAP: '2' } });
  t.after(() => store.close());
  const handler = createRequestHandler({ store, port: 4310, root: process.cwd() });
  const first = await post(handler, 'first');
  assert.equal(first.status, 200);
  assert.equal((await post(handler, 'second')).status, 503);
  assert.deepEqual(await post(handler, 'first'), first);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});
