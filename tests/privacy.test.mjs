import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { loadPrivacy, privacyPage, requirePrivacy } from '../lib/legal/privacy.mjs';
import { migrate } from '../lib/migrations.mjs';

test('privacy migration preserves historical versions and defaults optional consent to false', () => {
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
    db.exec(
      "INSERT INTO job_briefs (id,title,stack_json,seniority) VALUES ('job','Test','[]','mid'); INSERT INTO applications (id,job_brief_id,name,email,consent_version,consent_at,idempotency_key) VALUES ('old','job','Test','test@example.test','v1','2026-01-01','old')"
    );
    migrate(db);
    const privacy = loadPrivacy({});
    assert.equal(privacy.version, 'v3');
    db.prepare(
      'INSERT INTO applications (id,job_brief_id,name,email,consent_version,consent_at,idempotency_key,future_recruitment_consent) VALUES (?,?,?,?,?,?,?,?)'
    ).run('new', 'job', 'Test', 'test@example.test', privacy.version, '2026-11-01', 'new', 1);
    migrate(db);
    assert.deepEqual(
      db
        .prepare(
          'SELECT consent_version, future_recruitment_consent FROM applications ORDER BY rowid'
        )
        .all()
        .map((row) => ({ ...row })),
      [
        { consent_version: 'v1', future_recruitment_consent: 0 },
        { consent_version: 'v3', future_recruitment_consent: 1 },
      ]
    );
    assert.match(privacyPage('v1', privacy), /Wersja historyczna/);
  } finally {
    db.close();
  }
});

test('notice uses configured identity, DPO and retention without HTML injection', () => {
  const privacy = loadPrivacy({
    PRIVACY_CONTROLLER_NAME: '<Test>',
    PRIVACY_CONTROLLER_ADDRESS: 'Adres testowy',
    PRIVACY_CONTROLLER_CONTACT: 'privacy@example.test',
    PRIVACY_DPO_CONTACT: 'iod@example.test',
    RETENTION_DAYS: '30',
  });
  assert.doesNotThrow(() => requirePrivacy(privacy, true));
  const page = privacyPage('v3', privacy);
  for (const text of [
    '&lt;Test&gt;',
    'Adres testowy',
    'privacy@example.test',
    'iod@example.test',
    '30 dni',
    'zleceniodawca',
    'Cloudflare Workers AI',
    'art. 6',
    'Prezesa Urzędu',
    'człowieka',
  ]) {
    assert.ok(page.includes(text), text);
  }
  assert.ok(!page.includes('<Test>'));
});
