import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { seed } from '../hireos/dist/seed.js';
import { migrate } from '../lib/migrations.mjs';
import { openStore } from '../lib/store.mjs';

const mvpTables = [
  'cv_processing_jobs',
  'data_requests',
  'job_briefs',
  'requirements',
  'applications',
  'cv_files',
  'cv_profiles',
  'profile_facts',
  'screening_reports',
  'decisions',
  'outreach_tasks',
  'task_attempts',
  'model_calls',
  'api_keys',
  'audit_events',
  'ai_report_views',
  'outreach_reservations',
];
const history = (db) => db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();

function temporaryDatabase(t) {
  const dir = mkdtempSync(join(tmpdir(), 'hireos-migrations-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'test.sqlite');
}

test('empty database migrates once and preserves MVP data across reopen', (t) => {
  const path = temporaryDatabase(t);
  const store = openStore(path);
  assert.deepEqual(store.read(), seed);
  store.close();
  let db = new DatabaseSync(path);
  let before;
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row) => row.name);
    assert.deepEqual(
      tables.sort(),
      [
        ...mvpTables,
        'workspace',
        'requests',
        'schema_migrations',
        'model_gateway_blocks',
        'outreach_settings',
        'outreach_opt_out_tokens',
      ].sort()
    );
    before = history(db);
    assert.deepEqual(
      before.map(({ version, name }) => [version, name]),
      [
        [1, '001-demo.sql'],
        [2, '002-mvp.sql'],
        [3, '003-model-gateway.sql'],
        [4, '004-outreach-lease.sql'],
        [5, '005-application-consents.sql'],
        [6, '006-cv-queue.sql'],
        [7, '007-data-rights.sql'],
        [8, '008-ai-audit.sql'],
        [9, '009-retention-cycle.sql'],
        [10, '010-outreach-limits.sql'],
        [11, '011-outreach-opt-out.sql'],
      ]
    );
    db.prepare('INSERT INTO job_briefs (id, title, stack_json, seniority) VALUES (?, ?, ?, ?)').run(
      'job-1',
      'Backend demo',
      '["Node.js"]',
      'mid'
    );
    migrate(db);
    assert.deepEqual(history(db), before);
  } finally {
    db.close();
  }
  const reopened = openStore(path);
  assert.deepEqual(reopened.read(), seed);
  reopened.close();
  db = new DatabaseSync(path);
  try {
    assert.deepEqual(history(db), before);
    assert.equal(db.prepare('SELECT title FROM job_briefs').get().title, 'Backend demo');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
});

test('legacy database keeps exact workspace and cached responses after migration and retry', (t) => {
  const path = temporaryDatabase(t);
  const db = new DatabaseSync(path);
  const state = { ...structuredClone(seed), paused: true };
  const payload = JSON.stringify(state);
  try {
    // Schemat sprzed MVP-01, niezależny od plików nowych migracji.
    db.exec(
      'CREATE TABLE workspace (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL); CREATE TABLE requests (key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, response TEXT NOT NULL)'
    );
    db.prepare('INSERT INTO workspace VALUES (1, ?)').run(payload);
    db.prepare('INSERT INTO requests VALUES (?, ?, ?)').run(
      'legacy-pause',
      JSON.stringify({ action: 'pause', input: { paused: true } }),
      payload
    );
  } finally {
    db.close();
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const store = openStore(path);
    try {
      assert.deepEqual(store.read(), state);
      assert.deepEqual(store.mutate('pause', { paused: true }, 'legacy-pause'), state);
      assert.throws(() => store.mutate('pause', { paused: false }, 'legacy-pause'), /idempotencji/);
    } finally {
      store.close();
    }
  }
  const migrated = new DatabaseSync(path);
  try {
    assert.equal(history(migrated).length, 11);
    assert.equal(migrated.prepare('SELECT payload FROM workspace').get().payload, payload);
    assert.equal(migrated.prepare('SELECT response FROM requests').get().response, payload);
    for (const table of mvpTables) {
      assert.equal(migrated.prepare(`SELECT count(*) AS count FROM ${table}`).get().count, 0);
    }
  } finally {
    migrated.close();
  }
});

test('failed migration rolls back DDL and history; corrected database can retry', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      "CREATE TABLE applications (marker TEXT); INSERT INTO applications VALUES ('zachowaj')"
    );
    assert.throws(() => migrate(db), /already exists/);
    assert.deepEqual(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((row) => row.name),
      ['applications']
    );
    assert.equal(db.prepare('SELECT marker FROM applications').get().marker, 'zachowaj');
    db.exec('DROP TABLE applications');
    migrate(db);
    assert.equal(history(db).length, 11);
  } finally {
    db.close();
  }
});

test('schema enforces relationships and key domain constraints', () => {
  const db = new DatabaseSync(':memory:');
  try {
    migrate(db);
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    const job = db.prepare(
      'INSERT INTO job_briefs (id, title, stack_json, seniority) VALUES (?, ?, ?, ?)'
    );
    assert.throws(() => job.run('bad', 'Demo', 'invalid', 'mid'), /CHECK/);
    assert.throws(() => job.run('bad', 'Demo', '[]', 'unknown'), /CHECK/);
    job.run('job', 'Demo', '["Node.js"]', 'mid');
    const requirement = db.prepare('INSERT INTO requirements VALUES (?, ?, ?, ?, ?)');
    assert.throws(() => requirement.run('req', 'missing', 'Node.js', 'must', 1), /FOREIGN KEY/);
    assert.throws(() => requirement.run('req', 'job', 'Node.js', 'must', 4), /CHECK/);
    requirement.run('req', 'job', 'Node.js', 'must', 3);
    assert.throws(() => db.exec("DELETE FROM job_briefs WHERE id='job'"), /FOREIGN KEY/);
    const application = db.prepare(
      'INSERT INTO applications (id, job_brief_id, name, email, consent_version, consent_at, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    application.run(
      'app',
      'job',
      'Osoba Demo',
      'demo@example.test',
      'v1',
      '2026-10-30T12:00:00Z',
      'apply-1'
    );
    assert.throws(
      () =>
        application.run(
          'app2',
          'job',
          'Osoba Demo',
          'demo@example.test',
          'v1',
          '2026-10-30T12:00:00Z',
          'apply-1'
        ),
      /UNIQUE/
    );
    const decision = db.prepare(
      'INSERT INTO decisions (id, application_id, outcome, reason, actor, idempotency_key) VALUES (?, ?, ?, ?, ?, ?)'
    );
    assert.throws(
      () => decision.run('decision', 'app', 'rejected', ' ', 'Rekruter', 'decision-1'),
      /CHECK/
    );
    decision.run('decision', 'app', 'approved', 'Zweryfikowano dowody', 'Rekruter', 'decision-1');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
});

test('unknown migration history prevents writes from an older application', () => {
  const db = new DatabaseSync(':memory:');
  try {
    migrate(db);
    db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
      12,
      '012-future.sql'
    );
    const before = history(db);
    assert.throws(() => migrate(db), /historia migracji/);
    assert.deepEqual(history(db), before);
  } finally {
    db.close();
  }
});
