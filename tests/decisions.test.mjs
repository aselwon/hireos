import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createDecisions } from '../lib/decisions.mjs';
import { createHandler } from '../lib/http.mjs';
import { migrate } from '../lib/migrations.mjs';

function setup(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  migrate(db);
  db.exec(`INSERT INTO job_briefs (id,title,stack_json,seniority) VALUES ('job','Test','[]','mid');
    INSERT INTO applications (id,job_brief_id,name,email,consent_version,consent_at,idempotency_key)
    VALUES ('app','job','Test','test@example.test','v1','2026-01-01','application')`);
  return { db, decide: createDecisions(db) };
}

test('brak uzasadnienia zwraca 400 i nie zapisuje decyzji', (t) => {
  const { db, decide } = setup(t);
  assert.throws(
    () => decide('app', { outcome: 'rejected', reason: '  ' }, 'decision-1', 'recruiter'),
    {
      status: 400,
    }
  );
  assert.equal(db.prepare('SELECT count(*) AS count FROM decisions').get().count, 0);
});

for (const [reason, expectedStatus] of [
  [' ', 400],
  ['Brak wymaganych dowodów.', 200],
]) {
  test(`endpoint decyzji odpowiada raz: HTTP ${expectedStatus}`, async (t) => {
    const { db, decide } = setup(t);
    const handler = createHandler({
      store: { decide },
      keys: { authenticate: () => ({ id: 'recruiter-7', scope: 'admin' }) },
      sessions: { valid: () => false },
      port: 4310,
    });
    const req = Readable.from([JSON.stringify({ outcome: 'rejected', reason })]);
    Object.assign(req, {
      url: '/api/v1/applications/app/decision',
      method: 'POST',
      headers: {
        host: 'localhost:4310',
        authorization: 'Bearer recruiter-token',
        'content-type': 'application/json',
        'idempotency-key': 'decision-http',
      },
    });
    let status;
    let response;
    let responses = 0;
    await handler(req, {
      setHeader(name, value) {
        assert.ok(name);
        assert.ok(value);
      },
      writeHead(value) {
        responses += 1;
        status = value;
      },
      end(value) {
        response = JSON.parse(value);
      },
    });
    assert.equal(responses, 1);
    assert.equal(status, expectedStatus);
    if (expectedStatus === 400) {
      assert.match(response.error, /uzasadnienie/i);
    } else {
      assert.equal(response.decision.outcome, 'rejected');
      assert.equal(response.decision.reason, reason);
    }
    assert.equal(
      db.prepare('SELECT count(*) AS count FROM decisions').get().count,
      expectedStatus === 200 ? 1 : 0
    );
  });
}

test('decyzja człowieka atomowo zapisuje decyzję, etap i pełny audit log', (t) => {
  const { db, decide } = setup(t);
  const result = decide(
    'app',
    { outcome: 'rejected', reason: 'Brak wymaganych dowodów w profilu.' },
    'decision-1',
    'recruiter-7'
  );
  assert.equal(result.outcome, 'rejected');
  assert.equal(
    db.prepare('SELECT stage FROM applications WHERE id=?').get('app').stage,
    'rejected'
  );
  assert.deepEqual(
    { ...db.prepare('SELECT outcome, reason, actor FROM decisions').get() },
    {
      outcome: 'rejected',
      reason: 'Brak wymaganych dowodów w profilu.',
      actor: 'recruiter-7',
    }
  );
  const audit = db.prepare('SELECT * FROM audit_events').get();
  assert.equal(audit.actor, 'recruiter-7');
  assert.ok(audit.created_at);
  assert.equal(audit.action, 'application.rejected');
  assert.equal(audit.entity_id, 'app');
  assert.deepEqual(JSON.parse(audit.detail_json), {
    decisionId: result.id,
    reason: 'Brak wymaganych dowodów w profilu.',
    previousStage: 'new',
  });
  assert.deepEqual(
    decide(
      'app',
      { outcome: 'rejected', reason: 'Brak wymaganych dowodów w profilu.' },
      'decision-1',
      'recruiter-7'
    ),
    result
  );
  assert.equal(db.prepare('SELECT count(*) AS count FROM audit_events').get().count, 1);
});

test('decyzja zapisuje, czy raport AI był otwarty oraz zgodność rekrutera', (t) => {
  const { db, decide } = setup(t);
  const unopened = decide(
    'app',
    { outcome: 'approved', reason: 'Ocena własna.', agreedWithAi: false },
    'decision-unopened',
    'recruiter'
  );
  assert.equal(unopened.aiReportSeen, false);
  assert.equal(unopened.agreedWithAi, false);
  const row = db.prepare('SELECT ai_report_seen, agreed_with_ai FROM decisions').get();
  assert.equal(row.ai_report_seen, 0);
  assert.equal(row.agreed_with_ai, 0);
});

test('eksport CSV rejestru AI wymaga zalogowanego rekrutera', async (t) => {
  const { decide } = setup(t);
  const handler = createHandler({
    store: { decide, exportAiAudit: () => 'application_id,result_hash' },
    keys: { authenticate: (token) => (token === 'admin' ? { id: 'r1', scope: 'admin' } : null) },
    sessions: { valid: () => false },
    port: 4310,
  });
  async function get(authorization) {
    const req = Readable.from([]);
    Object.assign(req, {
      url: '/api/v1/audit/ai.csv',
      method: 'GET',
      headers: { host: 'localhost:4310', ...(authorization ? { authorization } : {}) },
    });
    const response = {};
    await handler(req, {
      setHeader(name, value) {
        assert.ok(name);
        assert.ok(value);
      },
      writeHead(status, headers) {
        response.status = status;
        response.headers = headers;
      },
      end(body) {
        response.body = body;
      },
    });
    return response;
  }
  assert.equal((await get()).status, 401);
  const response = await get('Bearer admin');
  assert.equal(response.status, 200);
  assert.match(response.headers['Content-Type'], /text\/csv/);
  assert.equal(response.body, 'application_id,result_hash');
});

test('strażnik: tylko moduł decyzji rekrutera zmienia etap aplikacji', () => {
  for (const file of readdirSync(new URL('../lib/', import.meta.url)).filter((name) =>
    name.endsWith('.mjs')
  )) {
    if (file === 'decisions.mjs') {
      continue;
    }
    const source = readFileSync(new URL(`../lib/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(
      source,
      /UPDATE\s+applications\s+SET\s+stage/i,
      `${file} zapisuje etap aplikacji`
    );
  }
});
