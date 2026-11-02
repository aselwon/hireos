import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { migrate } from '../lib/migrations.mjs';
import { createOutreach } from '../lib/outreach.mjs';

import { fixture, payload, addCandidate } from './outreach-fixture.mjs';

const route = '/api/v1/outreach-live';
const approval = {
  outreach_live: true,
  password: 'synthetic-password',
  control_test: { date: '2026-10-30', report_id: 'CONTROL-TEST-1', who: 'Rekruter Testowy' },
};

test('closed gate rejects ordinary recipients with 403 and no partial claim writes', async (t) => {
  const { request, db } = fixture(t, true, false, 'osoba@example.test');
  assert.equal((await request('session', route)).body.outreach_live, false);
  const created = await request('admin', '', payload, 'ordinary-create');
  assert.deepEqual(await request('admin', '', payload, 'ordinary-create'), created);
  const result = await request('worker-a', '/claim', {});
  assert.equal(result.status, 403);
  assert.equal(result.body.code, 'control_test_required');
  assert.equal(db.prepare('SELECT status FROM outreach_tasks').get().status, 'queued');
  assert.equal(db.prepare('SELECT count(*) AS n FROM outreach_reservations').get().n, 0);
});

test('control flag and configured recipient are both required, including on replay and preflight', async (t) => {
  const { request, db } = fixture(t, true, false, ' OSOBA@example.test ');
  addCandidate(db, 'ordinary');
  await request('admin', '', { ...payload, application_id: 'ordinary', control_recipient: true });
  const created = await request('admin', '', { ...payload, control_recipient: true });
  const claim = await request('worker-a', '/claim', {}, 'control-claim');
  assert.equal(claim.status, 200);
  assert.equal(claim.body.task.task_id, created.body.task.task_id);
  assert.equal(claim.body.task.control_recipient, true);
  db.prepare('UPDATE applications SET email=? WHERE id=?').run('changed@example.test', 'candidate');
  assert.equal(
    (await request('worker-a', '/claim', {}, 'control-claim')).body.code,
    'control_test_required'
  );
  assert.deepEqual((await request('worker-a', `/${claim.body.task.task_id}/preflight`)).body, {
    allowed: false,
    reason: 'control_test_required',
  });
  assert.equal((await request('worker-b', '/claim', {})).status, 403);
});

test('empty allowlist denies control tasks and worker cannot create or enable them', async (t) => {
  const { request } = fixture(t, true, false);
  assert.equal(
    (await request('worker-a', '', { ...payload, control_recipient: true })).status,
    403
  );
  await request('admin', '', { ...payload, control_recipient: true });
  assert.equal((await request('worker-a', '/claim', {})).body.code, 'control_test_required');
  for (const actor of ['worker-a', 'admin']) {
    assert.equal((await request(actor, route, approval)).status, 403);
    assert.equal((await request(actor, route)).status, 403);
  }
  assert.equal((await request('session', route)).body.outreach_live, false);
});

test('session requires password and valid evidence; activation is durable, audited and idempotent without storing password', async (t) => {
  const { request, db } = fixture(t, true, false);
  assert.equal((await request('session', route, { ...approval, password: 'wrong' })).status, 401);
  assert.equal((await request('session', route, { ...approval, control_test: {} })).status, 400);
  assert.equal(
    (
      await request('session', route, {
        ...approval,
        control_test: { ...approval.control_test, date: '2026-02-30' },
      })
    ).status,
    400
  );
  const first = await request('session', route, approval, 'enable-live');
  assert.equal(first.status, 200);
  assert.deepEqual(await request('session', route, approval, 'enable-live'), first);
  const events = db
    .prepare("SELECT * FROM audit_events WHERE action='outreach_live_enabled'")
    .all();
  assert.equal(events.length, 1);
  assert.equal(events[0].actor, 'recruiter-session');
  assert.equal(JSON.parse(events[0].detail_json).before.outreach_live, false);
  assert.deepEqual(JSON.parse(events[0].detail_json).after.control_test, approval.control_test);
  assert.equal(
    JSON.stringify(db.prepare('SELECT * FROM requests').all()).includes(approval.password),
    false
  );
  assert.equal(createOutreach(db).readLive().outreach_live, true);
  await request('admin', '', payload);
  assert.equal((await request('worker-a', '/claim', {})).status, 200);
});

test('password reauthentication is rate limited', async (t) => {
  const { request } = fixture(t, true, false);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await request('session', route, { ...approval, password: 'wrong' })).status, 401);
  }
  assert.equal((await request('session', route, approval)).status, 429);
  assert.equal((await request('session', route)).body.outreach_live, false);
});

test('migration closes gate on existing database without changing limits or legacy tasks', () => {
  const db = new DatabaseSync(':memory:');
  try {
    migrate(db);
    db.exec('DROP TABLE outreach_live_settings; DELETE FROM schema_migrations WHERE version=15');
    const before = db.prepare('SELECT * FROM outreach_settings').get();
    migrate(db);
    migrate(db);
    assert.deepEqual(createOutreach(db).readLive(), { outreach_live: false, control_test: null });
    assert.deepEqual(db.prepare('SELECT * FROM outreach_settings').get(), before);
    assert.match(
      readFileSync(new URL('../docs/verification.md', import.meta.url), 'utf8'),
      /OUTREACH_CONTROL_ALLOWLIST/
    );
  } finally {
    db.close();
  }
});

test('audit failure rolls activation back; conflicting retries cannot replace evidence', async (t) => {
  const { request, db } = fixture(t, true, false);
  db.exec(
    "CREATE TRIGGER fail_live_audit BEFORE INSERT ON audit_events WHEN NEW.action='outreach_live_enabled' BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END"
  );
  assert.equal((await request('session', route, approval, 'atomic-live')).status, 400);
  assert.equal((await request('session', route)).body.outreach_live, false);
  db.exec('DROP TRIGGER fail_live_audit');
  assert.equal((await request('session', route, approval, 'atomic-live')).status, 200);
  assert.equal(
    (
      await request(
        'session',
        route,
        { ...approval, control_test: { ...approval.control_test, report_id: 'other' } },
        'atomic-live'
      )
    ).status,
    409
  );
  assert.deepEqual((await request('session', route)).body.control_test, approval.control_test);
});
