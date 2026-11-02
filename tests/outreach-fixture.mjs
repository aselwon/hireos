import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';

import { createSessions, openKeys } from '../lib/auth.mjs';
import { createHandler } from '../lib/http.mjs';
import { createOutreach } from '../lib/outreach.mjs';
import { openStore } from '../lib/store.mjs';

export const payload = {
  application_id: 'candidate',
  job_brief_id: 'job',
  context: 'Rozmowa o roli Node.js.',
  contact_rules: 'Jedna wiadomość, bez follow-upów.',
  contact_rules_approved: true,
};
export const enabledSettings = {
  daily_global: 100,
  daily_per_recruitment: 100,
  recruitment_limits: {},
  max_followups: 100,
  min_interval_seconds: 0,
  start_hour: 0,
  end_hour: 24,
};
export function fixture(t, enabled = true, live = true, allowlist = '') {
  const dir = mkdtempSync(join(tmpdir(), 'hireos-outreach-'));
  const path = join(dir, 'test.sqlite');
  const store = openStore(path);
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA foreign_keys=ON; INSERT INTO job_briefs (id,title,stack_json,seniority) VALUES ('job','Demo','[]','mid'); INSERT INTO applications (id,job_brief_id,name,email,consent_version,consent_at,idempotency_key) VALUES ('candidate','job','Osoba Testowa','osoba@example.test','v1','2026-10-31','application')"
  );
  const keys = openKeys(path);
  const tokens = Object.fromEntries(
    ['admin', 'worker-a', 'worker-b'].map((id) => [
      id,
      keys.create(id, id === 'admin' ? 'admin' : 'worker:outreach'),
    ])
  );
  let time = Date.parse('2026-10-31T12:00:00Z');
  store.outreach = createOutreach(db, () => time, allowlist);
  // Existing lease/limit suites exercise outreach after the control test.
  if (live) {
    db.prepare('UPDATE outreach_live_settings SET payload_json=? WHERE id=1').run(
      JSON.stringify({
        outreach_live: true,
        control_test: { date: '2026-10-30', report_id: 'synthetic', who: 'Test' },
      })
    );
  }
  if (enabled) {
    store.outreach.mutate('settings', null, enabledSettings, 'enable', {
      id: 'admin',
      scope: 'admin',
    });
  }
  const sessions = createSessions('synthetic-password');
  const sessionToken = sessions.login('synthetic-password', 'fixture-login').token;
  const handler = createHandler({
    store,
    keys,
    sessions,
    port: 14314,
  });
  t.after(() => {
    store.close();
    keys.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  async function request(actor, route = '', input, key = crypto.randomUUID()) {
    const req = Readable.from(input === undefined ? [] : [JSON.stringify(input)]);
    req.url =
      route.startsWith('/api/') || route.startsWith('/opt-out/') ? route : `/api/v1/tasks${route}`;
    req.method = input === undefined ? 'GET' : 'POST';
    req.headers = {
      host: '127.0.0.1:14314',
      ...(actor === 'session'
        ? { cookie: `hireos_session=${sessionToken}` }
        : { authorization: `Bearer ${tokens[actor]}` }),
      'content-type': 'application/json',
      'idempotency-key': key,
    };
    let status;
    let body;
    await handler(req, {
      setHeader(name, value) {
        req.responseHeaders ??= {};
        req.responseHeaders[name] = value;
      },
      writeHead(code, headers = {}) {
        status = code;
        req.responseHeaders = headers;
      },
      end(value) {
        try {
          body = JSON.parse(value);
        } catch {
          body = value;
        }
      },
    });
    return { status, body, headers: req.responseHeaders };
  }
  return {
    request,
    db,
    keys,
    setTime: (value) => {
      time = Date.parse(value);
    },
    advance: (ms) => {
      time += ms;
    },
  };
}
export const report = (task, result = 'sent') => ({
  task_id: task.task_id,
  message_id: task.message_id,
  lease_id: task.lease_id,
  result,
  message: 'Wynik syntetycznej próby.',
});

export const settingsRoute = '/api/v1/outreach-settings';
export async function configure(request, settings) {
  const result = await request('admin', settingsRoute, { ...enabledSettings, ...settings });
  assert.equal(result.status, 200);
}
export function addCandidate(db, id, job = 'job') {
  db.prepare(
    'INSERT OR IGNORE INTO job_briefs (id,title,stack_json,seniority) VALUES (?,?,?,?)'
  ).run(job, 'Demo', '[]', 'mid');
  db.prepare(
    'INSERT INTO applications (id,job_brief_id,name,email,consent_version,consent_at,idempotency_key) VALUES (?,?,?,?,?,?,?)'
  ).run(id, job, 'Osoba Demo', `${id}@example.test`, 'v1', '2026-10-31', id);
}
export async function deniedClaim(request, code) {
  const result = await request('worker-b', '/claim', {});
  assert.equal(result.status, 429);
  assert.equal(result.body.code, code);
}
