import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createSessions, openKeys } from '../lib/auth.mjs';
import { createHandler } from '../lib/http.mjs';
import { openStore } from '../lib/store.mjs';

test('public application saves a validated PDF once and keeps its file private', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'hireos-application-'));
  const database = join(directory, 'hireos.sqlite');
  const keys = openKeys(database);
  const store = openStore(database);
  const handler = createHandler({
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
  const pdf = Buffer.from('%PDF-1.7\nsynthetic CV');
  const multipart = (file = pdf, consent = true) =>
    Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\nOsoba Testowa\r\n--${boundary}\r\nContent-Disposition: form-data; name="email"\r\n\r\ntest@example.test\r\n--${boundary}\r\nContent-Disposition: form-data; name="consentVersion"\r\n\r\nv1\r\n--${boundary}\r\nContent-Disposition: form-data; name="consent"\r\n\r\n${consent ? 'yes' : ''}\r\n--${boundary}\r\nContent-Disposition: form-data; name="cv"; filename="cv.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
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
      url.startsWith('/apply/') || url.startsWith('/api/v1/public-briefs/') ? 'GET' : 'POST';
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
  const repeated = await request();
  assert.equal(repeated.body.application.id, first.body.application.id);
  assert.equal(readdirSync(join(directory, 'cv')).length, 1);
  assert.deepEqual(readFileSync(join(directory, 'cv', readdirSync(join(directory, 'cv'))[0])), pdf);
  assert.equal((await request({ url: `/apply/${brief.id}` })).status, 200);
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
  assert.equal((await request({ key: 'application-key', body: multipart(pdf, true) })).status, 201);
});
