import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createBilling } from '../lib/billing.mjs';
import { createHandler } from '../lib/http.mjs';
import { migrate } from '../lib/migrations.mjs';
import { openStore } from '../lib/store.mjs';

test('billing calculates percentage and fixed fees in grosz, exports CSV and audits status', () => {
  const db = new DatabaseSync(':memory:');
  try {
    migrate(db);
    db.exec(`INSERT INTO clients (id,name,nip,contact,billing_model,fee_value,advance_grosz)
      VALUES ('success','Syntetyczna Firma','0000000000','test@example.test','success_fee',1250,10000),
      ('fixed','Druga Firma','1111111111','test@example.test','fixed_fee',99999,0);
      INSERT INTO job_briefs (id,title,stack_json,seniority,status,client_id) VALUES
      ('brief-success','Backend','[]','mid','approved','success'),
      ('brief-fixed','Frontend','[]','mid','approved','fixed');`);
    const billing = createBilling(db);
    const advance = billing.createBillingEvent(
      { briefId: 'brief-success', type: 'advance', occurredOn: '2026-11-01' },
      'advance-key'
    );
    assert.equal(advance.amount_grosz, 10000);
    const placement = billing.createBillingEvent(
      {
        briefId: 'brief-success',
        type: 'placement',
        occurredOn: '2026-11-02',
        salaryGrosz: 1234567,
      },
      'placement-key'
    );
    assert.equal(placement.amount_grosz, 144321);
    const fixed = billing.createBillingEvent(
      { briefId: 'brief-fixed', type: 'placement', occurredOn: '2026-11-03', salaryGrosz: 1 },
      'fixed-key'
    );
    assert.equal(fixed.amount_grosz, 99999);

    const csv = billing.exportBillingCsv();
    assert.match(csv, /salary_grosz,amount_grosz/);
    assert.match(csv, /"1234567","144321"/);
    assert.match(csv, /"1","99999"/);
    assert.doesNotMatch(csv, /1443\.21/);
    billing.updateBillingStatus(
      placement.id,
      { status: 'invoiced' },
      'status-key',
      'recruiter-test'
    );
    const audit = db.prepare("SELECT * FROM audit_events WHERE entity_type='billing_event'").get();
    assert.equal(audit.action, 'billing.status_changed');
    assert.equal(audit.actor, 'recruiter-test');
    assert.deepEqual(JSON.parse(audit.detail_json), { from: 'to_invoice', to: 'invoiced' });
  } finally {
    db.close();
  }
});

test('billing rejects invalid dates, amounts, duplicate advances and idempotency key reuse', () => {
  const db = new DatabaseSync(':memory:');
  try {
    migrate(db);
    db.exec(`INSERT INTO clients (id,name,nip,contact,billing_model,fee_value,advance_grosz)
      VALUES ('client','Firma','0000000000','test@example.test','fixed_fee',1000,500);
      INSERT INTO job_briefs (id,title,stack_json,seniority,status,client_id)
      VALUES ('brief','Backend','[]','mid','approved','client');`);
    const billing = createBilling(db);
    assert.throws(
      () =>
        billing.createBillingEvent(
          { briefId: 'brief', type: 'placement', occurredOn: '2026-02-30', salaryGrosz: 100 },
          'bad-date'
        ),
      /prawidłową datę/
    );
    assert.throws(
      () =>
        billing.createBillingEvent(
          { briefId: 'brief', type: 'placement', occurredOn: '2026-11-01', salaryGrosz: 0 },
          'bad-salary'
        ),
      /dodatnią kwotą/
    );
    billing.createBillingEvent(
      { briefId: 'brief', type: 'advance', occurredOn: '2026-11-01' },
      'advance'
    );
    assert.throws(
      () =>
        billing.createBillingEvent(
          { briefId: 'brief', type: 'advance', occurredOn: '2026-11-02' },
          'advance-2'
        ),
      /UNIQUE/
    );
    assert.throws(
      () => billing.updateBillingStatus('missing', { status: 'paid' }, 'advance'),
      /Klucz idempotencji/
    );
  } finally {
    db.close();
  }
});

test('billing API requires admin and exposes idempotent events, status and CSV', async (t) => {
  const store = openStore();
  t.after(() => store.close());
  const handler = createHandler({
    store,
    port: 4310,
    sessions: { valid: () => false },
    keys: { authenticate: (token) => (token ? { scope: token, id: 'admin-test' } : null) },
  });
  async function request(path, method = 'GET', input, key = 'key', scope = 'admin') {
    const req = Readable.from(input === undefined ? [] : [JSON.stringify(input)]);
    Object.assign(req, {
      url: path,
      method,
      headers: {
        host: 'localhost:4310',
        authorization: scope ? `Bearer ${scope}` : '',
        'content-type': 'application/json',
        'idempotency-key': key,
      },
    });
    let status;
    let body;
    await handler(req, {
      setHeader(name, value) {
        assert.ok(name);
        assert.ok(value);
      },
      writeHead(code) {
        status = code;
      },
      end(value) {
        body = value?.toString();
      },
    });
    return { status, body };
  }
  const client = store.createClient(
    {
      name: 'Firma API',
      nip: '0000000000',
      contact: 'test@example.test',
      billingModel: 'fixed_fee',
      feeValue: 12345,
      advanceGrosz: 0,
    },
    'client'
  );
  const brief = store.createBrief(
    {
      title: 'Backend API',
      stack: ['Node.js'],
      seniority: 'mid',
      salary: { min: 1, max: 2, currency: 'PLN', basis: 'net', contractType: 'b2b' },
      remote: true,
    },
    'brief'
  );
  store.assignClient(brief.id, { clientId: client.id }, 'assign');
  const eventInput = {
    briefId: brief.id,
    type: 'placement',
    occurredOn: '2026-11-02',
    salaryGrosz: 250000,
  };
  assert.equal(
    (await request('/api/v1/billing/events', 'POST', eventInput, 'event', 'worker:outreach'))
      .status,
    403
  );
  const created = await request('/api/v1/billing/events', 'POST', eventInput, 'event');
  assert.equal(created.status, 201);
  assert.equal(JSON.parse(created.body).event.amount_grosz, 12345);
  assert.equal((await request('/api/v1/billing/events')).status, 200);
  const eventId = JSON.parse(created.body).event.id;
  assert.equal(
    (await request(`/api/v1/billing/events/${eventId}/status`, 'POST', { status: 'paid' }, 'paid'))
      .status,
    200
  );
  const csv = await request('/api/v1/billing/events.csv');
  assert.equal(csv.status, 200);
  assert.match(csv.body, /"12345","paid"/);
});
