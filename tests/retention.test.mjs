import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDecisions } from '../lib/decisions.mjs';
import { createLogger } from '../lib/logger.mjs';
import { migrate } from '../lib/migrations.mjs';
import { purgeRejectedCv, retentionDays } from '../lib/retention.mjs';

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

  assert.equal(await purgeRejectedCv(db, { days: 30, now: new Date('2025-03-01T00:00:00Z') }), 1);
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
  assert.equal(await purgeRejectedCv(db, { days: 30 }), 0);
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
