import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Worker } from 'node:worker_threads';

import { outreachPage } from '../hireos/dist/outreach.js';
import { migrate } from '../lib/migrations.mjs';
import { createOutreach } from '../lib/outreach.mjs';

import { fixture, payload, report, configure, addCandidate } from './outreach-fixture.mjs';

test('panel API tworzy zadanie i obsługuje pauzę, przejęcie oraz blokadę kontaktu', async (t) => {
  const { request, db } = fixture(t);
  const created = await request('admin', '', payload, 'panel-create');
  assert.equal(created.status, 201);
  await request(
    'admin',
    '/api/v1/applications/candidate/outreach-control',
    { paused: true },
    'panel-pause'
  );
  assert.equal(
    (await request('admin', `/${created.body.task.task_id}/preflight`)).body.reason,
    'conversation_paused'
  );
  await request(
    'admin',
    '/api/v1/applications/candidate/outreach-control',
    { paused: false, human_takeover: true },
    'panel-takeover'
  );
  assert.equal(
    (await request('admin', `/${created.body.task.task_id}/preflight`)).body.reason,
    'human_takeover'
  );
  db.prepare('UPDATE applications SET do_not_contact=1 WHERE id=?').run('candidate');
  const panel = readFileSync(new URL('../hireos/dist/outreach.js', import.meta.url), 'utf8');
  assert.match(panel, /filter\(\(item\) => !item\.doNotContact\)/);
  assert.match(panel, /Kontakt zablokowany/);
  assert.equal((await request('admin', '', payload, 'panel-dnc-create')).status, 409);
});

test('panel wyświetla blokadę live i ukrywa akcje dla do_not_contact', () => {
  const html = outreachPage(
    {
      outreachLive: { outreach_live: false },
      outreachCandidates: [{ id: 'candidate', name: 'Osoba Testowa', doNotContact: true }],
      outreachTasks: [{ application_id: 'candidate', task_id: 'task', status: 'queued' }],
      outreachSettings: null,
      error: '',
    },
    String,
    () => ''
  );
  assert.match(html, /Kontakt z kandydatami jest zablokowany/);
  assert.match(html, /Kontakt zablokowany/);
  assert.doesNotMatch(html, /data-action="candidate-control"|data-action="cancel-task"/);
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

test('pauza rekrutacji i rozmowy oraz przejęcie blokują preflight, claim i wynik', async (t) => {
  const { request } = fixture(t);
  const {
    body: { task },
  } = await request('admin', '', payload, 'control-create');
  const {
    body: { task: leased },
  } = await request('worker-a', '/claim', {}, 'control-claim');
  assert.deepEqual((await request('admin', `/${task.task_id}/preflight`)).body, {
    allowed: true,
    reason: null,
  });
  await request(
    'admin',
    '/api/v1/briefs/job/outreach-control',
    { paused: true },
    'pause-recruitment'
  );
  assert.equal(
    (await request('admin', `/${task.task_id}/preflight`)).body.reason,
    'recruitment_paused'
  );
  assert.equal(
    (await request('worker-a', `/${task.task_id}/result`, report(leased), 'paused-send')).status,
    409
  );
  assert.equal((await request('worker-a', '/claim', {}, 'paused-claim')).body.task, null);
  await request(
    'admin',
    '/api/v1/briefs/job/outreach-control',
    { paused: false },
    'resume-recruitment'
  );
  await request(
    'admin',
    '/api/v1/applications/candidate/outreach-control',
    { paused: true },
    'pause-conversation'
  );
  assert.equal(
    (await request('admin', `/${task.task_id}/preflight`)).body.reason,
    'conversation_paused'
  );
  assert.equal(
    (await request('worker-a', `/${task.task_id}/result`, report(leased), 'conversation-send'))
      .status,
    409
  );
  await request(
    'admin',
    '/api/v1/applications/candidate/outreach-control',
    { paused: false, human_takeover: true },
    'takeover'
  );
  assert.equal(
    (await request('admin', `/${task.task_id}/preflight`)).body.reason,
    'human_takeover'
  );
  assert.equal(
    (await request('worker-a', `/${task.task_id}/result`, report(leased), 'takeover-send')).status,
    409
  );
  assert.equal((await request('worker-a', '/claim', {}, 'takeover-claim')).body.task, null);
});

test('odmowa ustawia do_not_contact, blokuje preflight i tworzenie kolejnych zadań', async (t) => {
  const { request, db } = fixture(t);
  const {
    body: { task },
  } = await request('admin', '', payload, 'refusal-create');
  const {
    body: { task: leased },
  } = await request('worker-a', '/claim', {}, 'refusal-claim');
  assert.equal(
    (
      await request(
        'worker-a',
        `/${task.task_id}/result`,
        report(leased, 'refused'),
        'refusal-result'
      )
    ).status,
    200
  );
  assert.equal(
    db.prepare('SELECT do_not_contact FROM applications WHERE id=?').get('candidate')
      .do_not_contact,
    1
  );
  assert.equal(
    (await request('admin', `/${task.task_id}/preflight`)).body.reason,
    'do_not_contact'
  );
  assert.equal((await request('admin', '', payload, 'refusal-create-again')).status, 409);
});

test('opt-out jest jednorazowy, anuluje otwarte zadania i blokuje nowe bez ujawniania kandydata', async (t) => {
  const { request, db } = fixture(t);
  const created = await request('admin', '', payload, 'optout-create');
  const { task } = created.body;
  assert.match(task.message_footer, /rezygnuj z kontaktu/);
  assert.match(task.opt_out_url, /^http:\/\/localhost:14314\/opt-out\/[A-Za-z0-9_-]+$/);
  const token = task.opt_out_url.split('/').at(-1);
  const result = await request('unknown', `/opt-out/${token}`);
  assert.equal(result.status, 200);
  assert.match(result.body, /została potwierdzona/);
  assert.equal(result.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.equal(
    db.prepare('SELECT do_not_contact FROM applications WHERE id=?').get('candidate')
      .do_not_contact,
    1
  );
  assert.equal(
    db.prepare('SELECT status FROM outreach_tasks WHERE id=?').get(task.task_id).status,
    'cancelled'
  );
  assert.equal((await request('admin', '', payload, 'optout-create-again')).status, 409);
  assert.match(
    (await request('unknown', `/opt-out/${token}`)).body,
    /nieprawidłowy lub został już użyty/
  );
  assert.equal((await request('unknown', '/api/v1/applications/candidate')).status, 401);
});

test('opt-out anuluje aktywny lease przed kolejnym wynikiem i claimem', async (t) => {
  const { request } = fixture(t);
  const {
    body: { task },
  } = await request('admin', '', payload, 'leased-optout-create');
  const {
    body: { task: leased },
  } = await request('worker-a', '/claim', {}, 'leased-optout-claim');
  const token = task.opt_out_url.split('/').at(-1);
  assert.equal((await request('unknown', `/opt-out/${token}`)).status, 200);
  assert.equal(
    (await request('worker-a', `/${leased.task_id}/result`, report(leased), 'after-optout')).status,
    404
  );
  assert.equal((await request('worker-b', '/claim', {}, 'after-optout-claim')).body.task, null);
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

test('unresolved blokuje claim do weryfikacji; verified_not_sent ponawia, verified_sent zamyka', async (t) => {
  const { request, db } = fixture(t);
  for (const finalResult of ['verified_not_sent', 'verified_sent']) {
    await request('admin', '', payload);
    const {
      body: { task },
    } = await request('worker-a', '/claim', {});
    assert.equal(
      (
        await request(
          'worker-a',
          `/${task.task_id}/result`,
          report(task, 'unresolved'),
          `unresolved-${finalResult}`
        )
      ).body.task.status,
      'unresolved'
    );
    assert.equal(
      (await request('worker-b', '/claim', {}, `blocked-${finalResult}`)).body.task,
      null
    );
    const verification = await request(
      'worker-a',
      `/${task.task_id}/result`,
      report(task, finalResult),
      finalResult
    );
    assert.equal(verification.status, 200);
    assert.equal(
      verification.body.task.status,
      finalResult === 'verified_not_sent' ? 'queued' : 'sent'
    );
    if (finalResult === 'verified_not_sent') {
      const retry = await request('worker-b', '/claim', {}, `retry-${finalResult}`);
      assert.equal(retry.body.task.task_id, task.task_id);
    } else {
      assert.equal(
        (await request('worker-b', '/claim', {}, `retry-${finalResult}`)).body.task,
        null
      );
    }
  }
  assert.equal(db.prepare('SELECT count(*) AS n FROM task_attempts').get().n, 4);
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

test('dwa równoległe połączenia SQLite nie przekraczają limitu dziennego', async (t) => {
  const { request, db } = fixture(t);
  await request('admin', '', payload);
  await configure(request, { daily_global: 1 });
  addCandidate(db, 'concurrent');
  await request('admin', '', { ...payload, application_id: 'concurrent' });
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
    } catch (error) { parentPort.postMessage({ code: error.code }); } finally { db.close(); }
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
  assert.equal(claims.filter(({ code }) => code === 'daily_global_limit').length, 1);
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM outreach_tasks WHERE status='leased'").get().n,
    1
  );
});
