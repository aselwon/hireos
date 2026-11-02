import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createDataRights } from '../lib/data-rights.mjs';
import { createHandler } from '../lib/http.mjs';
import { migrate } from '../lib/migrations.mjs';
import { createModelGateway } from '../lib/model-gateway.mjs';
import { createOutreach } from '../lib/outreach.mjs';

import { enabledSettings } from './outreach-fixture.mjs';

const receivedAt = '2026-01-01';
const admin = { id: 'admin', scope: 'admin' };
const worker = { id: 'worker', scope: 'worker:outreach' };
const payload = {
  application_id: 'candidate',
  job_brief_id: 'job',
  context: 'Syntetyczna rozmowa',
  contact_rules: 'Jedna wiadomość',
  contact_rules_approved: true,
};
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'hireos-rights-'));
  const db = new DatabaseSync(':memory:');
  migrate(db);
  const path = join(dir, 'cv.pdf');
  const pdf = readFileSync(new URL('./fixtures/text-cv.pdf', import.meta.url));
  writeFileSync(path, pdf);
  db.exec(`
    INSERT INTO job_briefs (id,title,stack_json,seniority) VALUES ('job','Demo','[]','mid');
    INSERT INTO applications (id,job_brief_id,name,email,consent_version,consent_at,idempotency_key) VALUES
    ('candidate','job','Syntetyczna Osoba','test@example.test','v2','2026-01-01','apply'),
    ('other','job','Inna Osoba','other@example.test','v2','2026-01-01','other-apply');
    INSERT INTO requirements VALUES ('requirement','job','Node.js','must',1);
    INSERT INTO api_keys (id,key_hash,scope) VALUES ('worker','hash','worker:outreach');
  `);
  db.prepare(
    'INSERT INTO cv_files (id,application_id,storage_path,original_name,sha256,size_bytes,extracted_text) VALUES (?,?,?,?,?,?,?)'
  ).run('cv', 'candidate', path, 'cv.pdf', 'hash', pdf.length, 'Syntetyczna Osoba');
  db.exec(`
    INSERT INTO cv_processing_jobs (cv_file_id) VALUES ('cv');
    INSERT INTO cv_profiles (id,cv_file_id,profile_json) VALUES ('profile','cv','{}');
    INSERT INTO profile_facts VALUES ('fact','profile','skill','"Node.js"','Syntetyczna Osoba',0);
    INSERT INTO screening_reports (id,cv_profile_id,report_json) VALUES ('report','profile','{}');
    INSERT INTO decisions (id,application_id,screening_report_id,outcome,reason,actor,idempotency_key) VALUES ('decision','candidate','report','approved','Syntetyczna Osoba','Rekruter','decision-key');
    INSERT INTO audit_events (id,actor,action,entity_type,entity_id,detail_json,idempotency_key) VALUES ('audit','Rekruter','approved','application','candidate','{"reason":"Syntetyczna Osoba"}','decision-key');
    INSERT INTO model_calls (id,provider,model,purpose,estimated_neurons,status,idempotency_key,response_json,application_id) VALUES ('model','fake','fake','screening',100,'completed','model-key','{"text":"Syntetyczna Osoba"}','candidate');
    INSERT INTO requests VALUES ('apply','{"action":"application"}','{"application":{"id":"candidate","name":"Syntetyczna Osoba"}}');
    INSERT INTO requests VALUES ('unrelated','{}','{"id":"other"}');
  `);
  db.prepare('UPDATE outreach_settings SET payload_json=? WHERE id=1').run(
    JSON.stringify(enabledSettings)
  );
  const outreach = createOutreach(db);
  const { task } = outreach.mutate('create', null, payload, 'create', admin);
  db.prepare(
    'INSERT INTO task_attempts (id,outreach_task_id,api_key_id,result,message,idempotency_key) VALUES (?,?,?,?,?,?)'
  ).run('attempt', task.task_id, 'worker', 'failed', 'Syntetyczna Osoba', 'attempt-key');
  const rights = createDataRights(db);
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { db, rights, outreach, path, pdf };
}

test('access exports every candidate table, indirect records, cache, model responses and exact PDF', (t) => {
  const { db, rights, pdf } = fixture(t);
  const result = rights.execute('candidate', { kind: 'access', receivedAt }, 'export');
  for (const table of [
    'applications',
    'job_briefs',
    'requirements',
    'cv_files',
    'cv_profiles',
    'cv_processing_jobs',
    'profile_facts',
    'screening_reports',
    'decisions',
    'outreach_tasks',
    'task_attempts',
    'audit_events',
    'model_calls',
    'requests',
    'data_requests',
  ]) {
    assert.ok(result.archive.tables[table].length > 0, table);
  }
  assert.equal(result.archive.tables.applications.length, 1);
  assert.deepEqual(Buffer.from(result.archive.files[0].content, 'base64'), pdf);
  assert.equal(result.request.due_at, '2026-01-31T00:00:00.000Z');
  assert.equal(
    rights.execute('candidate', { kind: 'access', receivedAt }, 'export').request.id,
    result.request.id
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM data_requests').get().n, 1);
  assert.throws(() => rights.execute('candidate', { kind: 'object', receivedAt }, 'export'), {
    status: 409,
  });
});

test('erasure removes CV and related data, anonymizes audit and model ledger, preserves other candidate and retries', (t) => {
  const { db, rights, path } = fixture(t);
  rights.execute('candidate', { kind: 'access', receivedAt }, 'export');
  const result = rights.execute('candidate', { kind: 'erase', receivedAt }, 'erase');
  assert.equal(existsSync(path), false);
  for (const table of [
    'cv_files',
    'cv_profiles',
    'cv_processing_jobs',
    'profile_facts',
    'screening_reports',
    'decisions',
    'outreach_tasks',
    'task_attempts',
  ]) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
  }
  assert.equal(db.prepare('SELECT id FROM applications').get().id, 'other');
  assert.equal(db.prepare('SELECT key FROM requests').get().key, 'unrelated');
  const audit = db.prepare('SELECT * FROM audit_events').all();
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, 'data.erased');
  assert.equal(audit[0].detail_json, '{}');
  for (const table of ['audit_events', 'model_calls', 'data_requests', 'requests']) {
    const serialized = JSON.stringify(db.prepare(`SELECT * FROM ${table}`).all());
    for (const secret of [
      'Syntetyczna Osoba',
      'test@example.test',
      'candidate',
      'decision-key',
      'model-key',
    ]) {
      assert.ok(!serialized.includes(secret), `${table}: ${secret}`);
    }
  }
  const model = db.prepare('SELECT * FROM model_calls').get();
  assert.equal(model.estimated_neurons, 100);
  assert.equal(model.response_json, null);
  assert.deepEqual(rights.execute('candidate', { kind: 'erase', receivedAt }, 'erase'), result);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.throws(() => rights.execute('candidate', { kind: 'access', receivedAt }, 'export'), {
    status: 404,
  });
});

test('objection blocks new and replayed creation, queued claims and replayed leases', (t) => {
  const { rights, outreach } = fixture(t);
  const leased = outreach.mutate('claim', null, {}, 'claim', worker).task;
  assert.ok(leased);
  rights.execute('candidate', { kind: 'object', receivedAt }, 'object');
  assert.throws(() => outreach.mutate('create', null, payload, 'new', admin), { status: 409 });
  assert.throws(() => outreach.mutate('create', null, payload, 'create', admin), { status: 409 });
  assert.throws(() => outreach.mutate('claim', null, {}, 'claim', worker), { status: 409 });
  assert.equal(outreach.mutate('claim', null, {}, 'next', worker).task, null);
  assert.equal(outreach.getPreflight(leased.task_id, worker).allowed, false);
  assert.equal(rights.list('candidate').length, 1);
});

test('objection leaves queued tasks unclaimable; invalid requests do not mutate data', (t) => {
  const { rights, outreach } = fixture(t);
  for (const input of [
    { kind: 'invalid', receivedAt },
    { kind: 'erase', receivedAt: 'invalid' },
    { kind: 'erase', receivedAt: '2999-01-01' },
  ]) {
    assert.throws(() => rights.execute('candidate', input, 'key'), { status: 400 });
  }
  assert.throws(() => rights.execute('candidate', { kind: 'erase', receivedAt }, ''), {
    status: 400,
  });
  rights.execute('candidate', { kind: 'object', receivedAt }, 'object');
  assert.equal(outreach.mutate('claim', null, {}, 'claim', worker).task, null);
});

test('erasure refuses in-flight models; filesystem failure rolls back and permits retry', (t) => {
  const { db, rights, path } = fixture(t);
  db.exec("UPDATE model_calls SET status='reserved'");
  assert.throws(() => rights.execute('candidate', { kind: 'erase', receivedAt }, 'erase'), {
    status: 409,
  });
  assert.equal(existsSync(path), true);
  db.exec("UPDATE model_calls SET status='completed'");
  db.prepare('UPDATE cv_files SET storage_path=?').run(tmpdir());
  assert.throws(() => rights.execute('candidate', { kind: 'erase', receivedAt }, 'erase'));
  assert.equal(rights.list('candidate').length, 0);
  assert.ok(db.prepare("SELECT id FROM applications WHERE id='candidate'").get());
  db.prepare('UPDATE cv_files SET storage_path=?').run(path);
  rights.execute('candidate', { kind: 'erase', receivedAt }, 'erase');
  assert.equal(existsSync(path), false);
});

test('HTTP rights endpoints require admin, JSON and allowed origin', async (t) => {
  const { rights } = fixture(t);
  const handler = createHandler({
    store: { dataRights: rights },
    keys: {
      authenticate: (token) => ({ admin, worker })[token] || null,
    },
    sessions: { valid: () => false },
    port: 4310,
  });
  async function call(token, method, headers = {}) {
    const req = Readable.from(
      method === 'POST' ? [JSON.stringify({ kind: 'object', receivedAt })] : []
    );
    Object.assign(req, {
      method,
      url: '/api/v1/applications/candidate/data-rights',
      headers: {
        host: 'localhost:4310',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': 'http',
        ...headers,
      },
    });
    let status;
    let body;
    await handler(req, {
      setHeader(name, value) {
        req.responseHeaders ??= {};
        req.responseHeaders[name] = value;
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
  assert.equal((await call('none', 'GET')).status, 401);
  assert.equal((await call('worker', 'POST')).status, 403);
  assert.equal((await call('admin', 'POST', { origin: 'https://invalid.test' })).status, 403);
  assert.equal((await call('admin', 'POST', { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await call('admin', 'POST')).status, 200);
  assert.equal((await call('admin', 'GET')).body.requests.length, 1);
});

test('migration 007 preserves an existing candidate and CV with an empty request register', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)'
    );
    for (const [index, name] of [
      '001-demo.sql',
      '002-mvp.sql',
      '003-model-gateway.sql',
      '004-outreach-lease.sql',
      '005-application-consents.sql',
      '006-cv-queue.sql',
    ].entries()) {
      db.exec(readFileSync(new URL(`../lib/migrations/${name}`, import.meta.url), 'utf8'));
      db.prepare('INSERT INTO schema_migrations VALUES (?,?,?)').run(index + 1, name, '2026-01-01');
    }
    db.exec(
      "INSERT INTO job_briefs (id,title,stack_json,seniority) VALUES ('job','Demo','[]','mid'); INSERT INTO applications (id,job_brief_id,name,email,consent_version,consent_at,idempotency_key) VALUES ('old','job','Demo','old@example.test','v2','2026-01-01','old'); INSERT INTO cv_files (id,application_id,storage_path,original_name,sha256,size_bytes) VALUES ('old-cv','old','/synthetic/cv.pdf','cv.pdf','hash',1)"
    );
    const before = db.prepare('SELECT * FROM applications').all();
    const files = db.prepare('SELECT * FROM cv_files').all();
    migrate(db);
    migrate(db);
    assert.deepEqual(db.prepare('SELECT * FROM applications').all(), before);
    assert.deepEqual(db.prepare('SELECT * FROM cv_files').all(), files);
    assert.deepEqual(db.prepare('SELECT * FROM data_requests').all(), []);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
});

test('model gateway links calls before provider execution and erasure keeps the budget charged', async (t) => {
  const { db, rights } = fixture(t);
  let complete;
  const gateway = createModelGateway(db, {
    provider: {
      name: 'fake',
      generate: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    },
  });
  const pending = gateway.generate(
    { prompt: 'Syntetyczna Osoba', purpose: 'cv-profile' },
    'pending-model',
    'candidate'
  );
  assert.equal(
    db.prepare("SELECT application_id FROM model_calls WHERE idempotency_key='pending-model'").get()
      .application_id,
    'candidate'
  );
  assert.throws(() => rights.execute('candidate', { kind: 'erase', receivedAt }, 'erase'), {
    status: 409,
  });
  complete({ text: 'Syntetyczna Osoba' });
  await pending;
  const budget = db.prepare('SELECT SUM(estimated_neurons) AS used FROM model_calls').get().used;
  rights.execute('candidate', { kind: 'erase', receivedAt }, 'erase');
  assert.equal(
    db.prepare('SELECT SUM(estimated_neurons) AS used FROM model_calls').get().used,
    budget
  );
  assert.equal(
    db
      .prepare(
        'SELECT COUNT(*) AS n FROM model_calls WHERE response_json IS NOT NULL OR application_id IS NOT NULL'
      )
      .get().n,
    0
  );
});
