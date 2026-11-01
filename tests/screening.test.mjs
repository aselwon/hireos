import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createSessions, openKeys } from '../lib/auth.mjs';
import { createHandler } from '../lib/http.mjs';
import { migrate } from '../lib/migrations.mjs';
import { createModelGateway } from '../lib/model-gateway.mjs';
import { createScreening } from '../lib/screening.mjs';

function setup(t, output) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  migrate(db);
  db.exec(`INSERT INTO job_briefs (id,title,stack_json,seniority) VALUES ('job','Test','[]','mid');
    INSERT INTO requirements VALUES ('r1','job','Node.js','must',3), ('r2','job','SQL','nice',1);
    INSERT INTO applications (id,job_brief_id,name,email,consent_version,consent_at,idempotency_key)
    VALUES ('app','job','Test','test@example.test','v1','2026-01-01','application');
    INSERT INTO cv_files (id,application_id,storage_path,original_name,sha256,size_bytes,status)
    VALUES ('cv','app','synthetic.pdf','cv.pdf','synthetic',100,'extracted');
    INSERT INTO cv_profiles (id,cv_file_id,profile_json,status) VALUES ('profile','cv','{}','completed');
    INSERT INTO profile_facts VALUES ('f1','profile','skill','"Node.js"','Znam Node.js',0),
      ('f2','profile','skill','"SQL"','Podstawy SQL',1),
      ('foreign','profile','skill','"Rust"','',0);`);
  let calls = 0;
  const gateway = createModelGateway(db, {
    env: { MODEL_PROVIDER: 'fake' },
    ...(output === undefined
      ? {}
      : {
          provider: {
            name: 'fake',
            generate(input) {
              calls += 1;
              assert.equal(input.purpose, 'screening');
              return {
                text:
                  typeof output === 'string' ? output : JSON.stringify({ requirements: output }),
              };
            },
          },
        }),
  });
  return { db, ...createScreening(db, gateway), calls: () => calls };
}

const item = (requirementId, factIds = [], status = 'met') => ({ requirementId, status, factIds });

test('met wymaga cytatu z tego profilu; niepewny fakt daje uncertain', async (t) => {
  for (const ids of [[], ['invented'], ['foreign']]) {
    const { generateScreening } = setup(t, [item('r1', ids), item('r2', ['f2'])]);
    const report = await generateScreening('app', 'screen');
    assert.equal(report.requirements[0].status, 'missing');
    assert.deepEqual(report.requirements[0].evidence, []);
    assert.equal(report.requirements[1].status, 'uncertain');
  }
  const { db, generateScreening, calls } = setup(t, [
    item('r1', ['f1', 'f1']),
    item('r2', [], 'missing'),
  ]);
  const report = await generateScreening('app', 'screen');
  assert.equal(report.requirements[0].status, 'met');
  assert.deepEqual(report.requirements[0].evidence, [
    { factId: 'f1', quote: 'Znam Node.js', uncertain: false },
  ]);
  assert.deepEqual(await generateScreening('app', 'screen'), report);
  assert.equal(calls(), 1);
  assert.deepEqual(
    JSON.parse(db.prepare('SELECT report_json FROM screening_reports').get().report_json),
    report
  );
  assert.equal(db.prepare('SELECT stage FROM applications').get().stage, 'new');
  assert.equal(db.prepare('SELECT count(*) AS n FROM decisions').get().n, 0);
  assert.equal(Object.hasOwn(report, 'score'), false);
  await assert.rejects(generateScreening('other', 'screen'), { status: 409 });
});

test('raport powstaje z wbudowanym fake providerem przez bramkę modeli', async (t) => {
  const { db, generateScreening } = setup(t);
  const report = await generateScreening('app', 'fake');
  assert.equal(report.applicationId, 'app');
  assert.equal(report.cvProfileId, 'profile');
  assert.deepEqual(
    report.requirements.map((r) => r.status),
    ['missing', 'missing']
  );
  assert.equal(db.prepare('SELECT provider FROM model_calls').get().provider, 'fake');
});

test('błędny schemat, brak lub powtórzenie wymagania nie zapisują raportu', async (t) => {
  for (const output of [
    '{',
    'null',
    '{}',
    [],
    [item('r1'), item('r1')],
    [item('r1'), item('other')],
    [item('r1'), item('r2', [], 'rejected')],
  ]) {
    const { db, generateScreening } = setup(t, output);
    await assert.rejects(generateScreening('app', 'invalid'), { status: 422 });
    assert.equal(db.prepare('SELECT count(*) AS n FROM screening_reports').get().n, 0);
  }
});

test('brak danych blokuje generowanie, zapis jest atomowy i ponawialny', async (t) => {
  const { db, generateScreening, calls } = setup(t, [item('r1', ['f1']), item('r2')]);
  await assert.rejects(generateScreening('app', ''), { status: 400 });
  await assert.rejects(generateScreening('absent', 'absent'), { status: 404 });
  db.exec("UPDATE cv_profiles SET status='needs_manual_review'");
  await assert.rejects(generateScreening('app', 'manual'), { status: 409 });
  assert.equal(calls(), 0);
  db.exec("UPDATE cv_profiles SET status='completed'");
  db.exec(
    "CREATE TRIGGER fail_request BEFORE INSERT ON requests BEGIN SELECT RAISE(ABORT, 'rollback'); END"
  );
  await assert.rejects(generateScreening('app', 'atomic'), /rollback/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM screening_reports').get().n, 0);
  db.exec('DROP TRIGGER fail_request');
  assert.equal((await generateScreening('app', 'atomic')).requirements[0].status, 'met');
  assert.equal(calls(), 1);
  db.exec('DELETE FROM requirements');
  await assert.rejects(generateScreening('app', 'empty'), { status: 409 });
});

test('endpoint screeningu wymaga admina i klucza, zwraca utrwalony raport', async (t) => {
  const store = setup(t);
  const keys = openKeys(':memory:');
  t.after(() => keys.close());
  const admin = keys.create('screen-admin', 'admin');
  const worker = keys.create('screen-worker', 'worker:outreach');
  const handler = createHandler({
    store,
    keys,
    sessions: createSessions('synthetic-password'),
    port: 4310,
  });
  async function post(token, key = 'http', origin) {
    const req = Readable.from(['{}']);
    Object.assign(req, {
      method: 'POST',
      url: '/api/v1/applications/app/screening',
      headers: {
        host: 'localhost:4310',
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'idempotency-key': key,
        ...(origin ? { origin } : {}),
      },
    });
    const result = {};
    await handler(req, {
      setHeader(name, value) {
        assert.equal(typeof name, 'string');
        assert.equal(typeof value, 'string');
      },
      writeHead(status) {
        result.status = status;
      },
      end(body) {
        result.body = JSON.parse(body);
      },
    });
    return result;
  }
  assert.equal((await post('')).status, 401);
  assert.equal((await post(worker)).status, 403);
  assert.equal((await post(admin, '')).status, 400);
  assert.equal((await post(admin, 'origin', 'https://example.test')).status, 403);
  const result = await post(admin);
  assert.equal(result.status, 200);
  assert.equal(result.body.requirements.length, 2);
  assert.deepEqual(await post(admin), result);
});
