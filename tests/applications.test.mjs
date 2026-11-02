import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createSessions, openKeys } from '../lib/auth.mjs';
import { createHandler } from '../lib/http.mjs';
import { loadPrivacy } from '../lib/legal/privacy.mjs';
import { openStore } from '../lib/store.mjs';

function assertCandidateTransparency(page, notice) {
  assert.match(page, /name="consentVersion" value="v3"/);
  for (const text of [page, notice]) {
    assert.match(text, /CV analizuje system AI wspierający rekrutera/);
    assert.match(text, /wyjaśnienie i weryfikację przez człowieka/);
    assert.doesNotMatch(
      text,
      /(?:AI|system)\s+(?:automatycznie\s+)?(?:odrzucił|zdecydował)|automatyczna decyzja/i
    );
  }
  assert.match(page, /AI nie podejmuje decyzji ani nie\s+odrzuca kandydatów automatycznie/);
  assert.match(page, /decyzję podejmuje człowiek/i);
  assert.match(
    notice,
    /AI nie podejmuje decyzji o wyniku rekrutacji ani nie odrzuca kandydatów automatycznie/
  );
}

function assertApplicationMessages() {
  const messages = readFileSync(new URL('../hireos/dist/apply.js', import.meta.url), 'utf8');
  assert.match(messages, /Dziękujemy\. Aplikacja została wysłana\./);
  assert.doesNotMatch(
    messages,
    /(?:AI|system)\s+(?:automatycznie\s+)?(?:odrzucił|zdecydował)|automatyczna decyzja/i
  );
}

test('public application saves a validated PDF once and keeps its file private', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'hireos-application-'));
  const database = join(directory, 'hireos.sqlite');
  const keys = openKeys(database);
  const store = openStore(database);
  let handler = createHandler({
    store,
    keys,
    sessions: createSessions('synthetic-password'),
    port: 14314,
    dataDir: directory,
  });
  t.after(() => {
    keys.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const brief = store.createBrief(
    {
      title: 'Inżynier API',
      stack: ['Node.js'],
      seniority: 'mid',
      salary: { min: 1, max: 2, currency: 'PLN', basis: 'gross', contractType: 'employment' },
      remote: true,
    },
    'brief-apply'
  );
  store.saveContent(
    brief.id,
    {
      advertisement: 'Dołącz do zespołu.',
      requirements: [{ description: 'Node.js', priority: 'must', weight: 2 }],
    },
    'content-apply'
  );
  store.approveBrief(brief.id, 'approve-apply');
  const boundary = 'hireos-test-boundary';
  const pdf = readFileSync(new URL('./fixtures/text-cv.pdf', import.meta.url));
  const multipart = (file = pdf, consent = true) =>
    Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\nOsoba Testowa\r\n--${boundary}\r\nContent-Disposition: form-data; name="email"\r\n\r\ntest@example.test\r\n--${boundary}\r\nContent-Disposition: form-data; name="consentVersion"\r\n\r\nv3\r\n--${boundary}\r\nContent-Disposition: form-data; name="consent"\r\n\r\n${consent ? 'yes' : ''}\r\n--${boundary}\r\nContent-Disposition: form-data; name="cv"; filename="cv.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
      ),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
  const request = async ({
    url = `/api/v1/briefs/${brief.id}/applications`,
    body = multipart(),
    key = 'application-key',
    cookie = '',
  } = {}) => {
    const req = Readable.from([body]);
    req.method =
      url.startsWith('/apply/') ||
      url.startsWith('/privacy/') ||
      url.startsWith('/api/v1/public-briefs/')
        ? 'GET'
        : 'POST';
    req.url = url;
    req.headers = {
      host: '127.0.0.1:14314',
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'idempotency-key': key,
      cookie,
    };
    let status;
    let responseBody;
    await handler(req, {
      setHeader(name, value) {
        req.responseHeaders ??= {};
        req.responseHeaders[name] = value;
      },
      writeHead(code) {
        status = code;
      },
      end(value) {
        responseBody = value;
      },
    });
    const text = responseBody?.toString();
    return { status, body: text?.startsWith('{') ? JSON.parse(text) : text };
  };

  const first = await request();
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const cv = store.getCvFile(first.body.application.id);
  assert.equal(cv.status, 'extracted');
  assert.match(cv.extracted_text, /Stanowisko: Backend Developer/);
  const repeated = await request();
  assert.equal(repeated.body.application.id, first.body.application.id);
  assert.equal(readdirSync(join(directory, 'cv')).length, 1);
  assert.deepEqual(readFileSync(join(directory, 'cv', readdirSync(join(directory, 'cv'))[0])), pdf);
  const page = await request({ url: `/apply/${brief.id}` });
  assert.match(page.body, /href="\/privacy\/v3"/);
  assert.match(page.body, /href="\/privacy\/v3"[^>]*>klauzuli informacyjnej/);
  assert.match(page.body, /name="futureRecruitmentConsent" type="checkbox" \/>/);
  const notice = await request({ url: '/privacy/v3' });
  assert.equal(notice.status, 200);
  assert.match(notice.body, /Projekt do przeglądu prawnego/);
  assertCandidateTransparency(page.body, notice.body);
  assertApplicationMessages();
  assert.equal((await request({ url: '/privacy/unknown' })).status, 404);
  const db = new DatabaseSync(database);
  t.after(() => db.close());
  assert.equal(
    db.prepare('SELECT consent_version FROM applications WHERE id=?').get(first.body.application.id)
      .consent_version,
    'v3'
  );
  assert.equal(
    db
      .prepare('SELECT future_recruitment_consent FROM applications WHERE id=?')
      .get(first.body.application.id).future_recruitment_consent,
    0
  );
  const optedIn = Buffer.from(
    multipart()
      .toString('latin1')
      .replace(
        `--${boundary}--`,
        `--${boundary}\r\nContent-Disposition: form-data; name="futureRecruitmentConsent"\r\n\r\nyes\r\n--${boundary}--`
      ),
    'latin1'
  );
  const future = await request({ body: optedIn, key: 'future-consent' });
  assert.equal(future.status, 201);
  assert.equal(
    db
      .prepare('SELECT future_recruitment_consent FROM applications WHERE id=?')
      .get(future.body.application.id).future_recruitment_consent,
    1
  );
  assert.equal((await request({ body: optedIn })).status, 400);
  const stale = Buffer.from(
    multipart().toString('latin1').replace('\r\nv3\r\n', '\r\nv1\r\n'),
    'latin1'
  );
  assert.equal((await request({ body: stale, key: 'stale' })).status, 409);
  const publicBrief = await request({ url: `/api/v1/public-briefs/${brief.id}` });
  assert.equal(publicBrief.status, 200);
  assert.equal(publicBrief.body.title, brief.title);
  assert.equal(
    (await request({ url: `/data/cv/${readdirSync(join(directory, 'cv'))[0]}` })).status,
    401
  );
  assert.equal(
    (await request({ body: multipart(Buffer.from('not a pdf')), key: 'bad-type' })).status,
    400
  );
  assert.equal(
    (await request({ body: multipart(Buffer.alloc(10 * 1024 * 1024 + 1, 65)), key: 'too-large' }))
      .status,
    413
  );
  assert.equal((await request({ body: multipart(pdf, false), key: 'no-consent' })).status, 400);
  const scanned = await request({
    body: multipart(readFileSync(new URL('./fixtures/scanned-cv.pdf', import.meta.url))),
    key: 'scanned-application',
  });
  assert.equal(scanned.status, 201);
  assert.deepEqual(
    { ...store.getCvFile(scanned.body.application.id) },
    {
      extracted_text: null,
      status: 'needs_manual_review',
    }
  );
  assert.equal((await request({ key: 'application-key', body: multipart(pdf, true) })).status, 201);
  for (const missing of [
    'PRIVACY_CONTROLLER_NAME',
    'PRIVACY_CONTROLLER_ADDRESS',
    'PRIVACY_CONTROLLER_CONTACT',
  ]) {
    const env = {
      PRIVACY_CONTROLLER_NAME: 'Administrator Testowy',
      PRIVACY_CONTROLLER_ADDRESS: 'Adres syntetyczny',
      PRIVACY_CONTROLLER_CONTACT: 'privacy@example.test',
    };
    delete env[missing];
    handler = createHandler({
      store,
      keys,
      sessions: createSessions('synthetic-password'),
      port: 14314,
      dataDir: directory,
      production: true,
      privacy: loadPrivacy(env),
    });
    for (const url of [
      `/apply/${brief.id}`,
      `/api/v1/public-briefs/${brief.id}`,
      `/api/v1/briefs/${brief.id}/applications`,
    ]) {
      const unavailable = await request({ url, key: 'blocked' });
      assert.equal(unavailable.status, 503);
      assert.match(unavailable.body.error, /niedostępny/);
    }
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM applications').get().count, 3);
});
