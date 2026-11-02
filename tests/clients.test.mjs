import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createClients } from '../lib/clients.mjs';
import { createHandler } from '../lib/http.mjs';
import { migrate } from '../lib/migrations.mjs';
import { openStore } from '../lib/store.mjs';

const client = {
  name: 'Firma Syntetyczna Test',
  nip: '0000000000',
  contact: 'kontakt@example.test',
  billingModel: 'success_fee',
  feeValue: 1250,
  advanceGrosz: 50000,
};

test('011 upgrades populated version 005 without changing recruitment data', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL)');
    const names = [
      '001-demo.sql',
      '002-mvp.sql',
      '003-model-gateway.sql',
      '004-outreach-lease.sql',
      '005-application-consents.sql',
    ];
    for (const [index, name] of names.entries()) {
      db.exec(readFileSync(new URL(`../lib/migrations/${name}`, import.meta.url), 'utf8'));
      db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(index + 1, name);
    }
    db.exec(
      "INSERT INTO job_briefs (id,title,stack_json,seniority,status) VALUES ('old','Rekrutacja syntetyczna','[]','mid','approved')"
    );
    const before = db.prepare('SELECT * FROM job_briefs').get();
    migrate(db);
    assert.deepEqual(
      { ...db.prepare('SELECT * FROM job_briefs').get() },
      { ...before, closed_at: null, client_id: null }
    );
    const clients = createClients(db);
    const created = clients.createClient(client, 'create');
    clients.assignClient('old', { clientId: created.id }, 'assign');
    migrate(db);
    assert.equal(db.prepare('SELECT client_id FROM job_briefs').get().client_id, created.id);
    assert.equal(clients.listClients().length, 1);
    assert.throws(() => db.exec("UPDATE job_briefs SET client_id='missing'"), /FOREIGN KEY/);
    assert.throws(() => db.exec('DELETE FROM clients'), /FOREIGN KEY/);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('SELECT count(*) AS count FROM schema_migrations').get().count, 11);
  } finally {
    db.close();
  }
});

test('client API validates terms, protects access and assigns briefs idempotently', async (t) => {
  const store = openStore();
  t.after(() => store.close());
  const handler = createHandler({
    store,
    port: 4310,
    sessions: { valid: () => false },
    keys: { authenticate: (token) => (token ? { scope: token } : null) },
  });
  async function request(
    path,
    method = 'GET',
    input,
    key = 'create',
    scope = 'admin',
    headers = {}
  ) {
    const req = Readable.from(input === undefined ? [] : [JSON.stringify(input)]);
    Object.assign(req, {
      url: path,
      method,
      headers: {
        host: 'localhost:4310',
        authorization: scope ? `Bearer ${scope}` : '',
        'content-type': 'application/json',
        'idempotency-key': key,
        ...headers,
      },
    });
    let status;
    let body;
    await handler(req, {
      setHeader() {
        /* Nagłówki nie są częścią tej asercji odpowiedzi API. */
      },
      writeHead(code) {
        status = code;
      },
      end(value) {
        body = JSON.parse(value);
      },
    });
    return { status, body };
  }
  for (const [scope, status] of [
    ['', 401],
    ['worker:outreach', 403],
  ]) {
    assert.equal((await request('/api/v1/clients', 'GET', undefined, '', scope)).status, status);
    assert.equal(
      (await request('/api/v1/clients', 'POST', client, 'blocked', scope)).status,
      status
    );
    assert.equal(
      (await request('/api/v1/briefs/missing/client', 'PUT', { clientId: null }, 'blocked', scope))
        .status,
      status
    );
  }
  assert.deepEqual((await request('/api/v1/clients')).body.clients, []);
  for (const invalid of [
    null,
    {},
    { ...client, name: ' ' },
    { ...client, contact: '' },
    { ...client, nip: 'bad' },
    { ...client, billingModel: 'other' },
    { ...client, feeValue: 10001 },
    { ...client, feeValue: 0.1 },
    { ...client, advanceGrosz: -1 },
    { ...client, feeValue: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    assert.equal((await request('/api/v1/clients', 'POST', invalid)).status, 400);
  }
  assert.equal((await request('/api/v1/clients', 'POST', client, '')).status, 400);
  assert.equal(
    (
      await request('/api/v1/clients', 'POST', client, 'origin', 'admin', {
        origin: 'https://example.test',
      })
    ).status,
    403
  );
  assert.equal(
    (
      await request('/api/v1/clients', 'POST', client, 'type', 'admin', {
        'content-type': 'text/plain',
      })
    ).status,
    415
  );
  const created = await request('/api/v1/clients', 'POST', client);
  assert.equal(created.status, 201);
  assert.equal(created.body.client.fee_value, 1250);
  assert.equal(created.body.client.advance_grosz, 50000);
  assert.deepEqual(await request('/api/v1/clients', 'POST', client), created);
  assert.equal(
    (await request('/api/v1/clients', 'POST', { ...client, name: 'Inna firma testowa' })).status,
    400
  );
  const second = await request(
    '/api/v1/clients',
    'POST',
    { ...client, billingModel: 'fixed_fee', feeValue: 1500000, advanceGrosz: 0 },
    'fixed'
  );
  assert.equal(second.status, 201);
  const brief = store.createBrief(
    {
      title: 'Test IT',
      stack: ['Node.js'],
      seniority: 'mid',
      salary: { min: 1, max: 2, currency: 'PLN', basis: 'net', contractType: 'b2b' },
      remote: true,
    },
    'brief'
  );
  const path = `/api/v1/briefs/${brief.id}/client`;
  for (const input of [{}, { clientId: 'missing' }, { clientId: 123 }]) {
    assert.equal((await request(path, 'PUT', input, 'assign')).status, 400);
  }
  assert.equal(store.getBrief(brief.id).client_id, null);
  const assigned = await request(path, 'PUT', { clientId: created.body.client.id }, 'assign');
  assert.equal(assigned.status, 200);
  assert.deepEqual(
    await request(path, 'PUT', { clientId: created.body.client.id }, 'assign'),
    assigned
  );
  assert.equal(
    (await request(`/api/v1/briefs/${brief.id}`)).body.brief.client_id,
    created.body.client.id
  );
  assert.equal((await request('/api/v1/briefs')).body.briefs[0].client_id, created.body.client.id);
  assert.equal(
    (await request(path, 'PUT', { clientId: second.body.client.id }, 'assign')).status,
    400
  );
  assert.equal(
    (await request(path, 'PUT', { clientId: second.body.client.id }, 'reassign')).status,
    200
  );
  assert.equal(store.getBrief(brief.id).client_id, second.body.client.id);
  assert.equal((await request(path, 'PUT', { clientId: null }, 'clear')).status, 200);
  assert.equal(store.getBrief(brief.id).client_id, null);
  assert.equal(
    (await request('/api/v1/briefs/missing/client', 'PUT', { clientId: null }, 'missing')).status,
    404
  );
  assert.equal((await request('/api/v1/clients')).body.clients.length, 2);
});
