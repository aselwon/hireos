import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createSessions, openKeys } from '../lib/auth.mjs';
import { createHandler } from '../lib/http.mjs';
import { openStore } from '../lib/store.mjs';

test(
  'E2E: login, brief approval, application, CV report, and recruiter decision',
  { timeout: 45000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'hireos-e2e-'));
    const database = join(directory, 'hireos.sqlite');
    const keys = openKeys(database);
    let modelCalls = 0;
    const store = openStore(database, {
      env: { MODEL_PROVIDER: 'fake' },
      provider: {
        name: 'fake',
        generate({ purpose, prompt }) {
          modelCalls += 1;
          if (purpose === 'job-advertisement') {
            return {
              text: JSON.stringify({
                advertisement: 'Szukamy inżyniera Node.js do syntetycznego zespołu.',
                requirements: [{ description: 'Node.js', priority: 'must', weight: 3 }],
              }),
            };
          }
          if (purpose === 'cv-profile') {
            assert.ok(prompt.includes('Technologia: Java'));
            return {
              text: JSON.stringify({
                skills: [{ value: 'Java', quote: 'Technologia: Java', uncertain: false }],
                experience: [],
                education: [],
                languages: [],
              }),
            };
          }
          assert.equal(purpose, 'screening');
          const { requirements } = JSON.parse(prompt.split('\nDane:\n')[1]);
          return {
            text: JSON.stringify({
              requirements: requirements.map(({ id }) => ({
                requirementId: id,
                status: 'missing',
                factIds: [],
              })),
            }),
          };
        },
      },
    });
    const db = new DatabaseSync(database, { readOnly: true });
    const sessions = createSessions('synthetic-password');
    const server = http.createServer();
    t.after(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => {
        server.close(resolve);
      });
      db.close();
      keys.close();
      store.close();
      await rm(directory, { recursive: true, force: true });
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    server.on(
      'request',
      createHandler({
        store,
        keys,
        sessions,
        port,
        dataDir: directory,
        sourceProfiles() {
          throw new Error('E2E must not call profile sourcing');
        },
      })
    );
    const base = `http://127.0.0.1:${port}`;
    const realFetch = globalThis.fetch;
    const blockedRequests = [];
    t.mock.method(globalThis, 'fetch', (input, options) => {
      if (new URL(input).origin !== base) {
        blockedRequests.push(String(input));
        throw new Error('E2E permits only its localhost server');
      }
      return realFetch(input, { ...options, redirect: 'error', signal: t.signal });
    });
    t.after(() => assert.deepEqual(blockedRequests, []));

    const json = (method, body, key, headers = {}) => ({
      method,
      headers: {
        'content-type': 'application/json',
        ...(key ? { 'idempotency-key': key } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const login = await fetch(
      `${base}/api/login`,
      json('POST', { password: 'synthetic-password' }, 'login-e2e')
    );
    assert.equal(login.status, 200);
    const [cookie] = login.headers.get('set-cookie').split(';');
    const recruiter = { cookie };

    const briefResponse = await fetch(
      `${base}/api/v1/briefs`,
      json(
        'POST',
        {
          title: 'Backend Developer',
          stack: ['Node.js'],
          seniority: 'mid',
          salary: { min: 20000, max: 25000, currency: 'PLN', basis: 'net', contractType: 'b2b' },
          remote: true,
        },
        'brief-e2e',
        recruiter
      )
    );
    assert.equal(briefResponse.status, 201);
    const { brief } = await briefResponse.json();
    const generated = await fetch(
      `${base}/api/v1/briefs/${brief.id}/generate`,
      json('POST', {}, 'generate-e2e', recruiter)
    );
    assert.equal(generated.status, 200);
    const contentResponse = await fetch(
      `${base}/api/v1/briefs/${brief.id}/content`,
      json(
        'PUT',
        {
          advertisement: 'Szukamy inżyniera Node.js.',
          requirements: [{ description: 'Node.js', priority: 'must', weight: 3 }],
        },
        'content-e2e',
        recruiter
      )
    );
    assert.equal(contentResponse.status, 200);
    const approved = await fetch(
      `${base}/api/v1/briefs/${brief.id}/approve`,
      json('POST', {}, 'approve-e2e', recruiter)
    );
    assert.equal(approved.status, 200);
    assert.equal((await approved.json()).brief.status, 'approved');

    const boundary = 'hireos-e2e-boundary';
    const pdf = readFileSync(new URL('./fixtures/text-cv.pdf', import.meta.url));
    const multipart = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\nOsoba Testowa\r\n--${boundary}\r\nContent-Disposition: form-data; name="email"\r\n\r\ntest@example.test\r\n--${boundary}\r\nContent-Disposition: form-data; name="consentVersion"\r\n\r\nv2\r\n--${boundary}\r\nContent-Disposition: form-data; name="consent"\r\n\r\nyes\r\n--${boundary}\r\nContent-Disposition: form-data; name="cv"; filename="cv.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
      ),
      pdf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const applicationResponse = await fetch(`${base}/api/v1/briefs/${brief.id}/applications`, {
      method: 'POST',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'idempotency-key': 'application-e2e',
      },
      body: multipart,
    });
    assert.equal(applicationResponse.status, 201);
    const { application } = await applicationResponse.json();

    const parsed = await fetch(
      `${base}/api/v1/applications/${application.id}/parse-cv`,
      json('POST', {}, 'parse-e2e', recruiter)
    );
    assert.equal(parsed.status, 200);
    const profile = await parsed.json();
    assert.equal(profile.status, 'completed');
    assert.deepEqual(profile.profile.skills, [
      { value: 'Java', quote: 'Technologia: Java', uncertain: false },
    ]);
    const screening = await fetch(
      `${base}/api/v1/applications/${application.id}/screening`,
      json('POST', {}, 'screening-e2e', recruiter)
    );
    assert.equal(screening.status, 200);
    const report = await screening.json();
    assert.equal(report.requirements.length, 1);
    assert.equal(report.requirements[0].status, 'missing');
    assert.equal(db.prepare('SELECT count(*) AS total FROM decisions').get().total, 0);
    assert.equal(store.listApplications(brief.id)[0].stage, 'new');
    const decision = await fetch(
      `${base}/api/v1/applications/${application.id}/decision`,
      json(
        'POST',
        { outcome: 'rejected', reason: 'Brak dowodu wymaganego doświadczenia.' },
        'decision-e2e',
        recruiter
      )
    );
    assert.equal(decision.status, 200);
    assert.equal((await decision.json()).decision.outcome, 'rejected');
    assert.equal(
      db.prepare('SELECT stage FROM applications WHERE id=?').get(application.id).stage,
      'rejected'
    );
    assert.equal(modelCalls, 3);
    assert.equal(db.prepare('SELECT count(*) AS total FROM model_calls').get().total, 3);
  }
);
