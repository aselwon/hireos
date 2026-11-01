import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import test from 'node:test';
import { Worker } from 'node:worker_threads';

import { createSessions, openKeys } from '../lib/auth.mjs';
import { createHandler } from '../lib/http.mjs';
import { migrate } from '../lib/migrations.mjs';
import { createOutreach } from '../lib/outreach.mjs';
import { openStore } from '../lib/store.mjs';

const payload = {
  application_id: 'candidate',
  job_brief_id: 'job',
  context: 'Rozmowa o roli Node.js.',
  contact_rules: 'Jedna wiadomość, bez follow-upów.',
  contact_rules_approved: true,
};
function fixture(t) {
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
  store.outreach = createOutreach(db, () => time);
  const handler = createHandler({
    store,
    keys,
    sessions: createSessions('synthetic-password'),
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
    req.url = `/api/v1/tasks${route}`;
    req.method = input === undefined ? 'GET' : 'POST';
    req.headers = {
      host: '127.0.0.1:14314',
      authorization: `Bearer ${tokens[actor]}`,
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
      writeHead(code) {
        status = code;
      },
      end(value) {
        body = JSON.parse(value);
      },
    });
    return { status, body };
  }
  return {
    request,
    db,
    keys,
    advance: (ms) => {
      time += ms;
    },
  };
}
const report = (task, result = 'sent') => ({
  task_id: task.task_id,
  message_id: task.message_id,
  lease_id: task.lease_id,
  result,
  message: 'Wynik syntetycznej próby.',
});

test('równoległe claimy HTTP przydzielają zadanie tylko jednemu wykonawcy', async (t) => {
  const { request } = fixture(t);
  const created = await request('admin', '', payload, 'create');
  assert.equal(created.status, 201);
  assert.deepEqual(await request('admin', '', payload, 'create'), created);
  const claims = await Promise.all(
    ['worker-a', 'worker-b'].map((actor) => request(actor, '/claim', {}, 'claim'))
  );
  assert.deepEqual(
    claims.map((r) => r.status),
    [200, 200]
  );
  assert.equal(claims.filter((r) => r.body.task).length, 1);
  const index = claims.findIndex((r) => r.body.task);
  const owner = ['worker-a', 'worker-b'][index];
  assert.equal(claims[index].body.task.worker_id, owner);
  assert.deepEqual(await request(owner, '/claim', {}, 'claim'), claims[index]);
  assert.equal((await request('admin')).body.tasks.length, 1);
});

test('wyniki są trwałe i idempotentne, konflikt nie tworzy drugiej próby', async (t) => {
  const { request, db } = fixture(t);
  for (const result of ['sent', 'replied', 'needs_intervention', 'failed', 'unresolved']) {
    await request('admin', '', payload);
    const {
      body: { task },
    } = await request('worker-a', '/claim', {});
    const route = `/${task.task_id}/result`;
    const input = report(task, result);
    const response = await request('worker-a', route, input, result);
    assert.equal(response.status, 200);
    assert.equal(response.body.task.status, result);
    assert.deepEqual(await request('worker-a', route, input, result), response);
    assert.equal(
      (await request('worker-a', route, { ...input, message: 'Inna treść' }, result)).status,
      409
    );
    assert.equal((await request('worker-a', route, input, 'new-key')).status, 409);
    const detail = await request('worker-a', `/${task.task_id}`);
    assert.equal(detail.body.attempts.length, 1);
    assert.equal(detail.body.attempts[0].result, result);
  }
  assert.equal(db.prepare('SELECT count(*) AS n FROM task_attempts').get().n, 5);
  assert.equal((await request('worker-b', '/claim', {})).body.task, null);
  const reopened = new DatabaseSync(db.location());
  try {
    const outreach = createOutreach(reopened);
    const task = outreach
      .read(null, { id: 'worker-a', scope: 'worker:outreach' })
      .tasks.find((item) => item.status === 'sent');
    assert.equal(
      outreach.mutate('result', task.task_id, report(task), 'sent', {
        id: 'worker-a',
        scope: 'worker:outreach',
      }).task.status,
      'sent'
    );
    assert.equal(reopened.prepare('SELECT count(*) AS n FROM task_attempts').get().n, 5);
  } finally {
    reopened.close();
  }
});

test('zakresy, własność, podszywanie się i odwołany klucz nie omijają autoryzacji', async (t) => {
  const { request, keys } = fixture(t);
  assert.equal((await request('worker-a', '', payload)).status, 403);
  assert.equal((await request('admin', '/claim', {})).status, 403);
  assert.equal((await request('worker-a', '/claim', { worker_id: 'worker-b' })).status, 403);
  const created = await request('admin', '', payload);
  const id = created.body.task.task_id;
  assert.equal((await request('worker-a', `/${id}`)).status, 404);
  const {
    body: { task },
  } = await request('worker-a', '/claim', {});
  assert.equal((await request('worker-b')).body.tasks.length, 0);
  assert.equal((await request('worker-a')).body.tasks.length, 1);
  assert.equal((await request('worker-b', `/${id}`)).status, 404);
  for (const action of ['heartbeat', 'result']) {
    assert.equal((await request('worker-b', `/${id}/${action}`, report(task))).status, 404);
  }
  assert.equal((await request('worker-a', '/missing')).status, 404);
  keys.revoke('worker-a');
  assert.equal((await request('worker-a', `/${id}`)).status, 401);
});

test('heartbeat przedłuża lease; wygaśnięcie pozwala na reclaim i blokuje stary wynik', async (t) => {
  const { request, advance } = fixture(t);
  await request('admin', '', payload);
  const {
    body: { task },
  } = await request('worker-a', '/claim', {}, 'original-claim');
  advance(30_000);
  const beat = await request('worker-a', `/${task.task_id}/heartbeat`, report(task), 'beat');
  assert.equal(beat.status, 200);
  assert.ok(beat.body.task.lease_until > task.lease_until);
  advance(31_000);
  assert.deepEqual(
    await request('worker-a', `/${task.task_id}/heartbeat`, report(task), 'beat'),
    beat
  );
  assert.equal((await request('worker-b', '/claim', {})).body.task, null);
  advance(29_000);
  assert.equal((await request('worker-a', `/${task.task_id}/result`, report(task))).status, 409);
  const reclaimed = await request('worker-b', '/claim', {});
  assert.equal(reclaimed.body.task.task_id, task.task_id);
  assert.equal(reclaimed.body.task.message_id, task.message_id);
  assert.notEqual(reclaimed.body.task.lease_id, task.lease_id);
  assert.equal((await request('worker-a', '/claim', {}, 'original-claim')).status, 404);
  assert.equal((await request('worker-a', `/${task.task_id}/result`, report(task))).status, 404);
  assert.equal((await request('worker-b', `/${task.task_id}/result`, report(task))).status, 409);
  assert.equal(
    (await request('worker-b', `/${task.task_id}/result`, report(reclaimed.body.task))).status,
    200
  );
});

test('walidacja nie zostawia częściowych zapisów', async (t) => {
  const { request, db } = fixture(t);
  for (const invalid of [
    null,
    [],
    {},
    { ...payload, contact_rules_approved: false },
    { ...payload, job_brief_id: 'missing' },
    { ...payload, context: '' },
  ]) {
    assert.equal((await request('admin', '', invalid)).status, 400);
  }
  assert.equal((await request('admin', '', payload, '')).status, 400);
  assert.equal(db.prepare('SELECT count(*) AS n FROM outreach_tasks').get().n, 0);
  await request('admin', '', payload);
  const {
    body: { task },
  } = await request('worker-a', '/claim', {});
  for (const input of [
    { ...report(task), result: 'invalid' },
    { ...report(task), message: '' },
    { ...report(task), task_id: 'other' },
    { ...report(task), message_id: 'other' },
  ]) {
    assert.ok(
      [400, 409].includes((await request('worker-a', `/${task.task_id}/result`, input)).status)
    );
  }
  assert.equal(db.prepare('SELECT count(*) AS n FROM task_attempts').get().n, 0);
  assert.equal((await request('worker-a', `/${task.task_id}`)).body.task.status, 'leased');
});

test('migracja istniejącego zadania zachowuje dane i dodaje lease_id tylko raz', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT)'
    );
    for (const [index, name] of [
      '001-demo.sql',
      '002-mvp.sql',
      '003-model-gateway.sql',
    ].entries()) {
      db.exec(readFileSync(new URL(`../lib/migrations/${name}`, import.meta.url), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (version,name) VALUES (?,?)').run(index + 1, name);
    }
    db.exec(
      "INSERT INTO job_briefs (id,title,stack_json,seniority) VALUES ('j','Demo','[]','mid'); INSERT INTO applications (id,job_brief_id,name,email,consent_version,consent_at,idempotency_key) VALUES ('a','j','Demo','demo@example.test','v1','2026-10-31','a'); INSERT INTO outreach_tasks (id,application_id,message_id,payload_json,idempotency_key) VALUES ('t','a','m','{}','t')"
    );
    const before = db.prepare('SELECT * FROM outreach_tasks').get();
    migrate(db);
    migrate(db);
    assert.deepEqual(
      { ...db.prepare('SELECT * FROM outreach_tasks').get() },
      { ...before, lease_id: null }
    );
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
});

test('dwa równoległe połączenia SQLite nie rezerwują tego samego zadania', async (t) => {
  const { request, db } = fixture(t);
  await request('admin', '', payload);
  const barrier = new SharedArrayBuffer(4);
  const source = `
    import { parentPort, workerData } from 'node:worker_threads';
    import { DatabaseSync } from 'node:sqlite';
    import { createOutreach } from ${JSON.stringify(new URL('../lib/outreach.mjs', import.meta.url).href)};
    const db = new DatabaseSync(workerData.path);
    db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
    const gate = new Int32Array(workerData.barrier);
    parentPort.postMessage('ready');
    Atomics.wait(gate, 0, 0);
    try {
      parentPort.postMessage(createOutreach(db).mutate('claim', null, {}, 'race', { id: workerData.id, scope: 'worker:outreach' }));
    } finally { db.close(); }
  `;
  let ready = 0;
  const claims = await Promise.all(
    ['worker-a', 'worker-b'].map(
      (id) =>
        new Promise((resolve, reject) => {
          const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(source)}`), {
            workerData: { path: db.location(), barrier, id },
          });
          t.after(() => worker.terminate());
          worker.on('error', reject);
          worker.on('exit', (code) => {
            if (code) {
              reject(new Error(`Worker exit: ${code}`));
            }
          });
          worker.on('message', (message) => {
            if (message !== 'ready') {
              resolve(message);
              return;
            }
            ready += 1;
            if (ready === 2) {
              Atomics.store(new Int32Array(barrier), 0, 1);
              Atomics.notify(new Int32Array(barrier), 0);
            }
          });
        })
    )
  );
  assert.equal(claims.filter(({ task }) => task).length, 1);
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM outreach_tasks WHERE status='leased'").get().n,
    1
  );
});
