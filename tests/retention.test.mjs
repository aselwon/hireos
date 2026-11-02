import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDecisions } from '../lib/decisions.mjs';
import { createLogger } from '../lib/logger.mjs';
import { migrate } from '../lib/migrations.mjs';
import { purgeRejectedCv, retentionDays, startRetentionSchedule } from '../lib/retention.mjs';

test('retencja usuwa CV i pochodne dla odrzuconej aplikacji po terminie', async (t) => {
  const db = new DatabaseSync(':memory:');
  const dir = await mkdtemp(join(tmpdir(), 'hireos-retention-'));
  t.after(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });
  migrate(db);
  db.exec(`INSERT INTO job_briefs (id,title,stack_json,seniority) VALUES ('job','Test','[]','mid');
    INSERT INTO applications (id,job_brief_id,name,email,consent_version,consent_at,idempotency_key)
    VALUES ('app','job','Synthetic Person','person@example.test','v1','2026-01-01','app');
    INSERT INTO cv_files (id,application_id,storage_path,original_name,sha256,size_bytes,extracted_text,status)
    VALUES ('cv','app','PLACEHOLDER','cv.pdf','hash',1,'private CV text','extracted');
    INSERT INTO cv_profiles (id,cv_file_id,profile_json,status) VALUES ('profile','cv','{}','completed');
    INSERT INTO profile_facts (id,cv_profile_id,category,value_json,quote) VALUES ('fact','profile','skill','{}','private quote');`);
  const path = join(dir, 'cv.pdf');
  await writeFile(path, 'synthetic PDF');
  db.prepare('UPDATE cv_files SET storage_path=? WHERE id=?').run(path, 'cv');
  createDecisions(db)(
    'app',
    { outcome: 'rejected', reason: 'Synthetic reason' },
    'decision',
    'tester'
  );
  db.prepare('UPDATE decisions SET created_at=?').run('2025-01-01T00:00:00.000Z');

  assert.deepEqual(await purgeRejectedCv(db, { days: 30, now: new Date('2025-03-01T00:00:00Z') }), {
    applications: 1,
    cvFiles: 1,
    outreachTasks: 0,
  });
  for (const table of ['cv_files', 'cv_profiles', 'profile_facts']) {
    assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
  }
  await assert.rejects(readFile(path), { code: 'ENOENT' });
});

test('retencja zachowuje nowsze CV i waliduje RETENTION_DAYS', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  migrate(db);
  assert.equal(retentionDays('14'), 14);
  assert.throws(() => retentionDays('0'), /RETENTION_DAYS/);
  assert.throws(() => retentionDays('invalid'), /RETENTION_DAYS/);
  assert.deepEqual(await purgeRejectedCv(db, { days: 30 }), {
    applications: 0,
    cvFiles: 0,
    outreachTasks: 0,
  });
});

test('pełny cykl retencji używa daty zamknięcia, zgody i zapisuje raport bez danych osobowych', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  migrate(db);
  db.exec(`INSERT INTO job_briefs (id,title,stack_json,seniority,status) VALUES
    ('closed','Test','[]','mid','approved'), ('open','Test','[]','mid','approved');
    INSERT INTO applications (id,job_brief_id,name,email,consent_version,consent_at,idempotency_key,future_recruitment_consent) VALUES
    ('no-consent','closed','Synthetic One','one@example.test','v1','2025-01-01','one',0),
    ('consent-expired','closed','Synthetic Two','two@example.test','v1','2025-01-01','two',1),
    ('consent-valid','closed','Synthetic Three','three@example.test','v1','2025-02-20','three',1),
    ('still-open','open','Synthetic Four','four@example.test','v1','2025-01-01','four',0);
    INSERT INTO api_keys (id,key_hash,scope) VALUES ('worker-key','hash','worker:outreach');
    INSERT INTO outreach_tasks (id,application_id,assigned_api_key_id,message_id,payload_json,idempotency_key)
      VALUES ('task','no-consent','worker-key','message','{"text":"Synthetic candidate"}','task-key');
    INSERT INTO task_attempts (id,outreach_task_id,api_key_id,result,message,idempotency_key)
      VALUES ('attempt','task','worker-key','sent','Synthetic contact note','attempt-key');`);
  db.prepare("UPDATE job_briefs SET status='closed' WHERE id='closed'").run();
  db.prepare("UPDATE job_briefs SET closed_at=? WHERE id='closed'").run('2025-01-01T00:00:00.000Z');
  const result = await purgeRejectedCv(db, {
    days: 30,
    now: new Date('2025-03-01T00:00:00.000Z'),
  });
  assert.deepEqual(result, { applications: 2, cvFiles: 0, outreachTasks: 1 });
  assert.deepEqual(
    db
      .prepare('SELECT id,name,email FROM applications ORDER BY id')
      .all()
      .map((row) => ({ ...row })),
    [
      { id: 'consent-expired', name: '[usunięto]', email: '[usunięto]' },
      { id: 'consent-valid', name: 'Synthetic Three', email: 'three@example.test' },
      { id: 'no-consent', name: '[usunięto]', email: '[usunięto]' },
      { id: 'still-open', name: 'Synthetic Four', email: 'four@example.test' },
    ]
  );
  const audit = db
    .prepare("SELECT action,detail_json FROM audit_events WHERE entity_type='retention'")
    .get();
  assert.equal(audit.action, 'retention.completed');
  assert.deepEqual(JSON.parse(audit.detail_json), {
    applications: 2,
    cvFiles: 0,
    outreachTasks: 1,
    days: 30,
  });
  assert.doesNotMatch(audit.detail_json, /Synthetic|@/);
  assert.deepEqual(
    { ...db.prepare('SELECT status,payload_json FROM outreach_tasks WHERE id=?').get('task') },
    { status: 'cancelled', payload_json: '{}' }
  );
  assert.equal(
    db.prepare('SELECT message FROM task_attempts WHERE id=?').get('attempt').message,
    '[usunięto przez retencję]'
  );
});

test('harmonogram uruchamia retencję ponownie bez restartu i można go zatrzymać', () => {
  let callback;
  let cleared;
  let runs = 0;
  const timer = {};
  const stop = startRetentionSchedule(
    () => {
      runs += 1;
    },
    {
      setTimer(run, interval) {
        callback = run;
        assert.equal(interval, 86400000);
        return {
          ...timer,
          unref() {
            timer.unrefCalled = true;
          },
        };
      },
      clearTimer(value) {
        cleared = value;
      },
    }
  );
  assert.equal(typeof callback, 'function');
  callback();
  assert.equal(runs, 1);
  assert.equal(timer.unrefCalled, true);
  stop();
  assert.ok(cleared);
});

test('logger redaguje dane osobowe i sekrety zagnieżdżone w szczegółach', () => {
  let output = '';
  createLogger((entry) => {
    output = entry;
  }).info('application', {
    name: 'Synthetic Person',
    email: 'person@example.test',
    phone: '+48 123 456 789',
    note: 'Contact person@example.test or +48 123 456 789',
    token: 'secret-token',
  });
  assert.doesNotMatch(output, /Synthetic Person|person@example\.test|123 456 789|secret-token/);
  assert.equal(JSON.parse(output).details.name, '[REDACTED]');
  assert.equal(JSON.parse(output).details.note, 'Contact [REDACTED] or [REDACTED]');
});
