import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import test from 'node:test';

import { shortlistPanel } from '../hireos/dist/shortlists.js';
import { createHandler } from '../lib/http.mjs';
import { escapeHtml } from '../lib/legal/privacy.mjs';
import { migrate } from '../lib/migrations.mjs';
import { createShortlists } from '../lib/shortlists.mjs';

function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  migrate(db);
  db.exec(`INSERT INTO clients (id,name,nip,contact,billing_model,fee_value,advance_grosz)
    VALUES ('client','Firma Testowa','0000000000','test@example.test','fixed_fee',0,0);
    INSERT INTO job_briefs (id,title,stack_json,seniority,client_id) VALUES ('brief','Test IT','[]','mid','client');
    INSERT INTO applications (id,job_brief_id,name,email,consent_version,consent_at,idempotency_key)
    VALUES ('candidate','brief','<Test>','test@example.test','v3','2026-01-01','application');`);
  let clock = new Date('2026-11-02T12:00:00Z');
  const shortlists = createShortlists(db, () => clock);
  const handler = createHandler({
    store: { shortlists },
    port: 4310,
    sessions: { valid: () => false },
    keys: { authenticate: (token) => (token ? { scope: token } : null) },
  });
  async function request(
    path,
    { method = 'GET', input, key = 'create', scope = '', headers = {} } = {}
  ) {
    const req = Readable.from(input === undefined ? [] : [JSON.stringify(input)]);
    Object.assign(req, {
      url: path,
      method,
      headers: {
        host: 'localhost:4310',
        authorization: scope ? `Bearer ${scope}` : '',
        'content-type': 'application/json',
        'idempotency-key': key,
        ...headers,
      },
    });
    const response = { headers: {} };
    await handler(req, {
      setHeader(name, value) {
        response.headers[name] = value;
      },
      writeHead(status, values) {
        response.status = status;
        Object.assign(response.headers, values);
      },
      end(body) {
        response.body = body;
      },
    });
    if (response.headers['Content-Type']?.startsWith('application/json')) {
      response.body = JSON.parse(response.body);
    }
    return response;
  }
  const input = {
    briefId: 'brief',
    applicationIds: ['candidate'],
    expiresAt: '2026-11-03T12:00:00Z',
  };
  const create = (overrides = {}, key = 'create') =>
    request('/api/v1/shortlists', {
      method: 'POST',
      input: { ...input, ...overrides },
      scope: 'admin',
      key,
    });
  return {
    db,
    shortlists,
    request,
    input,
    create,
    advance: () => {
      clock = new Date(input.expiresAt);
    },
  };
}

test('public link expires at boundary, revokes with 404, and audits every opening including failures', async (t) => {
  const { db, create, request, advance } = fixture(t);
  const created = await create();
  assert.equal(created.status, 201);
  assert.match(created.body.path, /^\/s\/[\w-]{43}$/);
  assert.deepEqual(await create(), created);
  assert.equal(db.prepare('SELECT count(*) n FROM shortlists').get().n, 1);
  assert.equal((await create({ fields: ['email'] })).status, 400);
  const { path } = created.body;
  for (let i = 0; i < 2; i++) {
    const opened = await request(path);
    assert.equal(opened.status, 200);
    assert.match(opened.body, /&lt;Test&gt;/);
    assert.doesNotMatch(
      opened.body,
      /test@example.test|Pobierz CV|consent_version|application_id|panel/
    );
    assert.equal(opened.headers['Cache-Control'], 'no-store');
    assert.equal(opened.headers['Referrer-Policy'], 'no-referrer');
    assert.equal(opened.headers['X-Robots-Tag'], 'noindex, nofollow, noarchive');
  }
  const second = await create({}, 'second');
  const revoke = `/api/v1/shortlists/${second.body.id}/revoke`;
  const options = { method: 'POST', scope: 'admin', input: {}, key: 'revoke' };
  assert.equal((await request(revoke, options)).status, 200);
  assert.equal((await request(revoke, options)).status, 200);
  assert.equal((await request(second.body.path)).status, 404);
  advance();
  assert.equal((await request(path)).status, 404);
  assert.equal((await request('/s/unknown')).status, 404);
  const events = db
    .prepare("SELECT * FROM audit_events WHERE action='shortlist.opened' ORDER BY rowid")
    .all();
  assert.equal(events.length, 5);
  assert.deepEqual(
    events.map((event) => JSON.parse(event.detail_json).granted),
    [true, true, false, false, false]
  );
  assert.equal(new Set(events.map((event) => event.idempotency_key)).size, 5);
  assert.ok(events.every((event) => event.created_at && event.actor === 'public-link'));
  assert.ok(events.every((event) => !JSON.stringify(event).includes(path.slice(3))));
});

test('consent and membership are checked on creation and each read; failed creation rolls back', async (t) => {
  const { db, create, request } = fixture(t);
  for (const version of ['v1', 'v2', 'v4', '']) {
    db.prepare('UPDATE applications SET consent_version=?').run(version);
    assert.equal((await create()).status, 400);
  }
  assert.equal(db.prepare('SELECT count(*) n FROM shortlists').get().n, 0);
  db.exec("UPDATE applications SET consent_version='v3'");
  for (const invalid of [
    { applicationIds: [] },
    { applicationIds: ['missing'] },
    { applicationIds: ['candidate', 'candidate'] },
    { applicationIds: ['candidate', 'missing'] },
    { fields: ['storage_path'] },
    { fields: [] },
    { cvApplicationIds: ['missing'] },
    { expiresAt: 'bad' },
    { expiresAt: '2027-01-01' },
    { expiresAt: '2026-11-01' },
    { briefId: 'missing' },
    { cvApplicationIds: ['candidate'] },
  ]) {
    assert.equal((await create(invalid)).status, 400);
  }
  const created = await create();
  db.exec("UPDATE applications SET consent_version='v1'");
  assert.equal((await request(created.body.path)).status, 404);
  db.exec("UPDATE applications SET consent_version='v3', do_not_contact=1");
  assert.equal((await request(created.body.path)).status, 404);
  assert.equal((await create({}, 'objected')).status, 400);
  db.exec('UPDATE applications SET do_not_contact=0; UPDATE job_briefs SET client_id=NULL');
  assert.equal((await request(created.body.path)).status, 404);
  assert.equal((await create({}, 'no-client')).status, 400);
  db.exec("UPDATE job_briefs SET client_id='client'; DELETE FROM applications");
  assert.equal((await request(created.body.path)).status, 404);
  assert.equal(db.prepare('SELECT count(*) n FROM shortlist_members').get().n, 0);
});

test('management requires admin and valid mutations; explicit fields and CV grants are isolated', async (t) => {
  const { db, create, request, input } = fixture(t);
  for (const [scope, status] of [
    ['', 401],
    ['worker:outreach', 403],
  ]) {
    for (const path of ['/api/v1/shortlists', '/api/v1/shortlists/id/revoke']) {
      assert.equal((await request(path, { method: 'POST', input, scope })).status, status);
    }
  }
  for (const [headers, status] of [
    [{ origin: 'https://example.test' }, 403],
    [{ 'content-type': 'text/plain' }, 415],
    [{ 'idempotency-key': '' }, 400],
  ]) {
    assert.equal(
      (await request('/api/v1/shortlists', { method: 'POST', input, scope: 'admin', headers }))
        .status,
      status
    );
  }
  db.prepare(
    `INSERT INTO cv_files (id,application_id,storage_path,original_name,sha256,size_bytes,status)
    VALUES ('cv','candidate',?,'synthetic.pdf','hash',10,'extracted')`
  ).run(new URL('./fixtures/text-cv.pdf', import.meta.url).pathname);
  const minimal = await create();
  assert.equal((await request(`${minimal.body.path}/cv/cv`)).status, 404);
  const explicit = await create({ fields: ['email'], cvApplicationIds: ['candidate'] }, 'explicit');
  const opened = await request(explicit.body.path);
  assert.match(opened.body, /test@example.test/);
  assert.doesNotMatch(opened.body, /&lt;Test&gt;/);
  assert.match(opened.body, /Pobierz CV/);
  const downloaded = await request(`${explicit.body.path}/cv/cv`);
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers['Content-Type'], 'application/pdf');
  assert.deepEqual(
    downloaded.body,
    readFileSync(new URL('./fixtures/text-cv.pdf', import.meta.url))
  );
  assert.equal((await request(`${explicit.body.path}/cv/other`)).status, 404);
  assert.equal((await request('/api/v1/shortlists?briefId=brief')).status, 401);
  const listed = await request('/api/v1/shortlists?briefId=brief', { scope: 'admin' });
  assert.equal(listed.body.shortlists.length, 2);
  assert.deepEqual(Object.keys(listed.body.shortlists[0]).sort(), [
    'candidate_count',
    'created_at',
    'expires_at',
    'id',
    'revoked_at',
  ]);
  assert.doesNotMatch(JSON.stringify(listed.body), /test@example.test|<Test>|token|path/);
  assert.equal(
    (await request('/', { headers: { cookie: `hireos_session=${explicit.body.path.slice(3)}` } }))
      .status,
    401
  );
  db.exec('DELETE FROM cv_files');
  assert.equal((await request(`${explicit.body.path}/cv/cv`)).status, 404);
});

test('012 migration preserves populated version 011 and installs cascading memberships', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL)');
    const names = readFileSync(new URL('../lib/migrations.mjs', import.meta.url), 'utf8')
      .match(/\d{3}-[\w-]+\.sql/g)
      .slice(0, 11);
    names.forEach((name, index) => {
      db.exec(readFileSync(new URL(`../lib/migrations/${name}`, import.meta.url), 'utf8'));
      db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(index + 1, name);
    });
    db.exec(
      "INSERT INTO job_briefs (id,title,stack_json,seniority) VALUES ('existing','Test','[]','mid')"
    );
    const before = db.prepare('SELECT * FROM job_briefs').get();
    migrate(db);
    migrate(db);
    assert.deepEqual(db.prepare('SELECT * FROM job_briefs').get(), before);
    assert.equal(db.prepare('SELECT MAX(version) n FROM schema_migrations').get().n, 12);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('SELECT count(*) n FROM shortlists').get().n, 0);
  } finally {
    db.close();
  }
});

test('shortlist form disables ineligible candidates, defaults to name only and escapes content', () => {
  const html = shortlistPanel(
    { client_id: 'client' },
    [
      { id: 'old', name: '<Old>', consentVersion: 'v1' },
      { id: 'new', name: 'New', consentVersion: 'v3' },
    ],
    [{ id: 'link', expires_at: '2026-11-03', revoked_at: null }],
    escapeHtml
  );
  assert.match(html, /value="old" disabled/);
  assert.match(html, /&lt;Old&gt;/);
  assert.match(html, /value="name" checked/);
  assert.doesNotMatch(html, /value="email" checked|name="cvApplicationIds"[^>]*checked/);
  assert.match(html, /data-revoke-shortlist="link"/);
  assert.match(shortlistPanel({}, [], [], escapeHtml), /Najpierw przypisz klienta/);
});
