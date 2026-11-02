import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { migrate } from '../lib/migrations.mjs';
import { createOutreach } from '../lib/outreach.mjs';

import {
  fixture,
  payload,
  report,
  configure,
  addCandidate,
  deniedClaim,
  enabledSettings,
  settingsRoute,
} from './outreach-fixture.mjs';

test('domyślne limity blokują claim; ustawienia wymagają admina i mają idempotentny audyt', async (t) => {
  const { request, db } = fixture(t, false);
  await request('admin', '', payload);
  await deniedClaim(request, 'outreach_disabled');
  assert.equal(db.prepare('SELECT count(*) AS n FROM outreach_reservations').get().n, 0);
  assert.equal((await request('worker-a', settingsRoute)).status, 403);
  assert.equal((await request('worker-a', settingsRoute, enabledSettings)).status, 403);
  const saved = await request('admin', settingsRoute, enabledSettings, 'settings');
  assert.equal(saved.status, 200);
  assert.deepEqual(await request('admin', settingsRoute, enabledSettings, 'settings'), saved);
  assert.equal(
    (await request('admin', settingsRoute, { ...enabledSettings, daily_global: 1 }, 'settings'))
      .status,
    409
  );
  for (const invalid of [
    {},
    { ...enabledSettings, daily_global: -1 },
    { ...enabledSettings, start_hour: 24 },
    { ...enabledSettings, recruitment_limits: { missing: 1 } },
  ]) {
    assert.equal((await request('admin', settingsRoute, invalid)).status, 400);
  }
  const events = db
    .prepare("SELECT * FROM audit_events WHERE action='outreach_limits_updated'")
    .all();
  assert.equal(events.length, 1);
  assert.equal(events[0].actor, 'admin');
  assert.equal(events[0].created_at, '2026-10-31T12:00:00.000Z');
  assert.equal(JSON.parse(events[0].detail_json).before.daily_global, 0);
  assert.deepEqual(JSON.parse(events[0].detail_json).after, enabledSettings);
  assert.deepEqual((await request('admin', settingsRoute)).body.settings, enabledSettings);
  assert.equal((await request('worker-a', '/claim', {})).status, 200);
});

test('limit globalny liczy rezerwacje i resetuje się o północy w Warszawie', async (t) => {
  const { request, db, setTime } = fixture(t);
  await configure(request, { daily_global: 1 });
  setTime('2026-07-01T21:59:00Z');
  await request('admin', '', payload);
  const first = await request('worker-a', '/claim', {}, 'first');
  assert.deepEqual(await request('worker-a', '/claim', {}, 'first'), first);
  addCandidate(db, 'second');
  await request('admin', '', { ...payload, application_id: 'second' });
  await deniedClaim(request, 'daily_global_limit');
  await request('worker-a', `/${first.body.task.task_id}/result`, report(first.body.task));
  setTime('2026-07-01T22:00:00Z');
  assert.equal((await request('worker-b', '/claim', {})).body.task.application_id, 'second');
});

test('limit rekrutacji i nadpisanie działają niezależnie od globalnego', async (t) => {
  const { request, db } = fixture(t);
  await configure(request, { daily_per_recruitment: 1, recruitment_limits: { job: 0 } });
  await request('admin', '', payload);
  await deniedClaim(request, 'outreach_disabled');
  await configure(request, { daily_per_recruitment: 1 });
  const first = (await request('worker-a', '/claim', {})).body.task;
  await request('worker-a', `/${first.task_id}/result`, report(first));
  addCandidate(db, 'second');
  await request('admin', '', { ...payload, application_id: 'second' });
  await deniedClaim(request, 'daily_recruitment_limit');
  await configure(request, { daily_per_recruitment: 1, recruitment_limits: { job: 2 } });
  assert.equal((await request('worker-b', '/claim', {})).body.task.application_id, 'second');
  addCandidate(db, 'third', 'other');
  await request('admin', '', { ...payload, application_id: 'third', job_brief_id: 'other' });
  assert.equal((await request('worker-a', '/claim', {})).body.task.application_id, 'third');
});

test('follow-upy i minimalny odstęp uwzględniają także zarezerwowane wiadomości', async (t) => {
  const { request, advance } = fixture(t);
  await configure(request, { max_followups: 1, min_interval_seconds: 120 });
  await request('admin', '', payload);
  const first = (await request('worker-a', '/claim', {})).body.task;
  await request('worker-a', `/${first.task_id}/result`, report(first));
  await request('admin', '', payload);
  await deniedClaim(request, 'message_interval');
  advance(119_999);
  await deniedClaim(request, 'message_interval');
  advance(1);
  const second = (await request('worker-b', '/claim', {})).body.task;
  assert.ok(second);
  await request('worker-b', `/${second.task_id}/result`, report(second, 'unresolved'));
  await request('admin', '', payload);
  await deniedClaim(request, 'followup_limit');
});

test('godziny wysyłki stosują czas Europe/Warsaw zimą, latem i podczas zmiany czasu', async (t) => {
  const { request, setTime } = fixture(t);
  await configure(request, { start_hour: 9, end_hour: 17 });
  await request('admin', '', payload);
  for (const time of [
    '2026-01-01T07:59:59Z',
    '2026-07-01T06:59:59Z',
    '2026-07-01T15:00:00Z',
    '2026-03-29T06:59:59Z',
    '2026-10-25T07:59:59Z',
  ]) {
    setTime(time);
    await deniedClaim(request, 'outside_sending_hours');
  }
  for (const time of [
    '2026-01-01T08:00:00Z',
    '2026-03-29T07:00:00Z',
    '2026-07-01T07:00:00Z',
    '2026-10-25T08:00:00Z',
  ]) {
    setTime(time);
    assert.equal((await request('worker-a', '/claim', {})).status, 200);
  }
  await configure(request, { start_hour: 22, end_hour: 6 });
  setTime('2026-10-26T21:00:00Z');
  assert.ok((await request('worker-a', '/claim', {})).body.task);
  setTime('2026-10-27T05:00:00Z');
  await deniedClaim(request, 'outside_sending_hours');
});

test('odstęp zaczyna się od późniejszego wyniku, a retry nie zużywa follow-upu', async (t) => {
  const { request, advance, db } = fixture(t);
  await configure(request, { max_followups: 0, min_interval_seconds: 120, daily_global: 1 });
  await request('admin', '', payload);
  const first = (await request('worker-a', '/claim', {})).body.task;
  advance(60_000);
  const retry = (await request('worker-b', '/claim', {})).body.task;
  assert.equal(retry.task_id, first.task_id);
  assert.equal(db.prepare('SELECT count(*) AS n FROM outreach_reservations').get().n, 1);
  advance(30_000);
  await request('worker-b', `/${retry.task_id}/result`, report(retry));
  await configure(request, { max_followups: 1, min_interval_seconds: 120 });
  await request('admin', '', payload);
  advance(119_999);
  await deniedClaim(request, 'message_interval');
  advance(1);
  assert.ok((await request('worker-a', '/claim', {})).body.task);
});

test('migracja limitów zachowuje istniejącą historię kontaktu i wyłącza claimy', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT)'
    );
    for (const [index, name] of [
      '001-demo.sql',
      '002-mvp.sql',
      '003-model-gateway.sql',
      '004-outreach-lease.sql',
    ].entries()) {
      db.exec(readFileSync(new URL(`../lib/migrations/${name}`, import.meta.url), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (version,name) VALUES (?,?)').run(index + 1, name);
    }
    addCandidate(db, 'legacy');
    for (const [id, status] of [
      ['first', 'sent'],
      ['second', 'unresolved'],
      ['third', 'queued'],
    ]) {
      db.prepare(
        'INSERT INTO outreach_tasks (id,application_id,message_id,payload_json,idempotency_key,status) VALUES (?,?,?,?,?,?)'
      ).run(id, 'legacy', id, '{}', id, status);
    }
    const before = db.prepare('SELECT * FROM outreach_tasks ORDER BY id').all();
    migrate(db);
    migrate(db);
    assert.deepEqual(db.prepare('SELECT * FROM outreach_tasks ORDER BY id').all(), before);
    assert.deepEqual(
      db
        .prepare('SELECT task_id,is_initial FROM outreach_reservations ORDER BY task_id')
        .all()
        .map((row) => ({ ...row })),
      [
        { task_id: 'first', is_initial: 1 },
        { task_id: 'second', is_initial: 0 },
      ]
    );
    const outreach = createOutreach(db);
    assert.equal(outreach.readSettings().daily_global, 0);
    assert.equal(outreach.readLive().outreach_live, false);
    // Isolate the existing limits assertion after the new control-test gate.
    db.prepare('UPDATE outreach_live_settings SET payload_json=? WHERE id=1').run(
      JSON.stringify({
        outreach_live: true,
        control_test: { date: '2026-10-30', report_id: 'synthetic', who: 'Test' },
      })
    );
    assert.throws(
      () =>
        outreach.mutate('claim', null, {}, 'legacy-claim', {
          id: 'worker',
          scope: 'worker:outreach',
        }),
      { code: 'outreach_disabled' }
    );
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
});

test('błąd audytu cofa konfigurację i zapis idempotencji', async (t) => {
  const { request, db } = fixture(t, false);
  const before = (await request('admin', settingsRoute)).body;
  db.exec(
    "CREATE TRIGGER reject_limits_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END"
  );
  assert.equal(
    (await request('admin', settingsRoute, enabledSettings, 'retry-settings')).status,
    400
  );
  assert.deepEqual((await request('admin', settingsRoute)).body, before);
  assert.equal(db.prepare('SELECT count(*) AS n FROM requests').get().n, 0);
  db.exec('DROP TRIGGER reject_limits_audit');
  assert.equal(
    (await request('admin', settingsRoute, enabledSettings, 'retry-settings')).status,
    200
  );
  const reopened = new DatabaseSync(db.location());
  try {
    assert.deepEqual(createOutreach(reopened).readSettings(), enabledSettings);
  } finally {
    reopened.close();
  }
});
