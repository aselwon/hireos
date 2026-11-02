import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { applicationStatus, emptyReport } from '../hireos/dist/report.js';
import { startCvWorker } from '../lib/cv-queue.mjs';
import { migrate } from '../lib/migrations.mjs';
import { createProvider } from '../lib/model-providers.mjs';
import { openStore } from '../lib/store.mjs';

function setup(t, cap = '9000') {
  const dir = mkdtempSync(join(tmpdir(), 'hireos-queue-'));
  const path = join(dir, 'test.sqlite');
  let date = new Date('2026-11-01T23:59:00Z');
  const calls = [];
  const fake = createProvider({}, () => assert.fail('Network forbidden'));
  let fail = false;
  const options = {
    env: { MODEL_DAILY_NEURON_CAP: cap },
    now: () => date,
    provider: {
      name: 'fake',
      generate(input) {
        calls.push(input.purpose);
        if (fail) {
          fail = false;
          throw new Error('Synthetic outage');
        }
        return input.purpose === 'cv-profile'
          ? { text: JSON.stringify({ skills: [], experience: [], education: [], languages: [] }) }
          : fake.generate(input);
      },
    },
  };
  let store = openStore(path, options);
  const db = new DatabaseSync(path);
  t.after(() => {
    store.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const brief = store.createBrief(
    {
      title: 'Backend synthetic',
      stack: ['Node.js'],
      seniority: 'mid',
      remote: true,
      salary: { min: 1, max: 2, currency: 'PLN', basis: 'net', contractType: 'b2b' },
    },
    'brief'
  );
  store.saveContent(
    brief.id,
    {
      advertisement: 'Syntetyczne ogłoszenie',
      requirements: [{ description: 'Node.js', priority: 'must', weight: 1 }],
    },
    'content'
  );
  store.approveBrief(brief.id, 'approve');
  function apply(id = 'cv', text = 'Znam Node.js') {
    return store.createApplication(
      brief.id,
      {
        name: 'Osoba syntetyczna',
        email: 'synthetic@example.test',
        consentVersion: 'v1',
      },
      `apply-${id}`,
      {
        id,
        originalName: 'cv.pdf',
        storagePath: `/tmp/synthetic-unused-${id}.pdf`,
        sha256: id,
        sizeBytes: 100,
        extractedText: text,
        status: text ? 'extracted' : 'needs_manual_review',
      }
    );
  }
  return {
    db,
    calls,
    apply,
    brief,
    get store() {
      return store;
    },
    advance() {
      date = new Date('2026-11-02T00:00:00Z');
    },
    failNext() {
      fail = true;
    },
    reopen() {
      store.close();
      store = openStore(path, options);
    },
    job(id = 'cv') {
      return db.prepare('SELECT * FROM cv_processing_jobs WHERE cv_file_id=?').get(id);
    },
  };
}

test('daily cap defers screening to UTC midnight, survives restart and does not reparse', async (t) => {
  const s = setup(t, '100');
  const application = s.apply();
  assert.equal(s.apply().created, false);
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM cv_processing_jobs').get().n, 1);
  assert.equal(s.store.listApplications(s.brief.id)[0].processingStatus, 'queued');
  await s.store.processCvQueue();
  assert.deepEqual(s.calls, ['cv-profile']);
  assert.equal(s.job().stage, 'screening');
  assert.equal(s.job().status, 'queued');
  assert.equal(s.job().available_at, '2026-11-02T00:00:00.000Z');
  s.reopen();
  await s.store.processCvQueue();
  assert.equal(s.calls.length, 1);
  s.advance();
  await s.store.processCvQueue();
  await s.store.processCvQueue();
  assert.deepEqual(s.calls, ['cv-profile', 'screening']);
  assert.equal(s.job().status, 'completed');
  assert.equal(
    s.store.listApplications(s.brief.id)[0].report.applicationId,
    application.application.id
  );
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM cv_profiles').get().n, 1);
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM screening_reports').get().n, 1);
});

test('submission survives restart before processing; worker processes in background and stops', async (t) => {
  const s = setup(t);
  s.apply();
  s.reopen();
  const stop = startCvWorker(s.store, (error) => assert.fail(error.message), 5);
  await stop();
  assert.equal(s.job().status, 'completed');
  assert.deepEqual(s.calls, ['cv-profile', 'screening']);
});

test('provider failure retries next UTC day and a scan requires manual review', async (t) => {
  const s = setup(t);
  s.apply();
  s.apply('scan', '');
  s.failNext();
  await s.store.processCvQueue();
  assert.equal(s.job().status, 'queued');
  assert.equal(s.job('scan').status, 'needs_manual_review');
  s.advance();
  await s.store.processCvQueue();
  assert.equal(s.job().status, 'completed');
  assert.deepEqual(s.calls, ['cv-profile', 'cv-profile', 'screening']);
});

test('recovery reuses committed parse result after interruption before stage checkpoint', async (t) => {
  const s = setup(t);
  const { application } = s.apply();
  await s.store.parseCv(application.id, 'cv-queue:cv:parse:0');
  s.reopen();
  await Promise.all([s.store.processCvQueue(), s.store.processCvQueue()]);
  assert.equal(s.job().status, 'completed');
  assert.deepEqual(s.calls, ['cv-profile', 'screening']);
});

test('configuration rejects alternative providers, including injected providers', () => {
  for (const name of ['openai', 'anthropic', 'google', 'other']) {
    assert.throws(() => openStore(':memory:', { env: { MODEL_PROVIDER: name } }), /dostawcy/);
    assert.throws(() => openStore(':memory:', { provider: { name } }), /dostawcy/);
  }
});

test('queue migration preserves existing v5 data without scheduling historical applications', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)'
    );
    const names = [
      '001-demo',
      '002-mvp',
      '003-model-gateway',
      '004-outreach-lease',
      '005-application-consents',
    ];
    names.forEach((name, i) => {
      db.exec(readFileSync(new URL(`../lib/migrations/${name}.sql`, import.meta.url), 'utf8'));
      db.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?)').run(
        i + 1,
        `${name}.sql`,
        '2026-11-01'
      );
    });
    db.exec(
      "INSERT INTO job_briefs (id,title,stack_json,seniority) VALUES ('old','Synthetic','[]','mid')"
    );
    migrate(db);
    migrate(db);
    assert.equal(db.prepare('SELECT title FROM job_briefs').get().title, 'Synthetic');
    assert.equal(db.prepare('SELECT count(*) AS n FROM cv_processing_jobs').get().n, 0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
});

test('panel renders queue status ahead of completed profile and explains UTC wait', () => {
  const html =
    applicationStatus(
      { processingStatus: 'queued', profileStatus: 'completed' },
      { queued: 'W kolejce' }
    ) + emptyReport({ processingStatus: 'queued' });
  assert.match(html, /W kolejce/);
  assert.match(html, /00:00 UTC/);
  assert.doesNotMatch(html, /Profil gotowy/);
});

test('exhausted budget retains every queued application before parsing', async (t) => {
  const s = setup(t, '100');
  s.apply('first');
  s.apply('second');
  await s.store.processCvQueue();
  assert.equal(s.job('first').stage, 'screening');
  assert.equal(s.job('second').stage, 'parse');
  assert.equal(s.job('second').available_at, '2026-11-02T00:00:00.000Z');
  s.reopen();
  s.advance();
  await s.store.processCvQueue();
  assert.equal(s.job('first').status, 'completed');
  assert.equal(s.job('second').status, 'queued');
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM cv_processing_jobs').get().n, 2);
});

test('queue insertion failure rolls back the application and CV transaction', (t) => {
  const s = setup(t);
  s.db.exec(`CREATE TRIGGER fail_queue BEFORE INSERT ON cv_processing_jobs
    BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END`);
  assert.throws(() => s.apply(), /synthetic failure/);
  for (const table of ['applications', 'cv_files', 'cv_processing_jobs']) {
    assert.equal(s.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
  }
});
