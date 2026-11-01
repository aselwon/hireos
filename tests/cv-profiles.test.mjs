import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createSessions, openKeys } from '../lib/auth.mjs';
import { createCvProfiles } from '../lib/cv-profiles.mjs';
import { createHandler } from '../lib/http.mjs';
import { migrate } from '../lib/migrations.mjs';
import { createModelGateway } from '../lib/model-gateway.mjs';

const source = 'Node.js; Firma Testowa; Programista; 2020; 2024; Uczelnia Testowa; angielski B2';
const fact = (value, quote = value, uncertain = false) => ({ value, quote, uncertain });
const profile = () => ({
  skills: [fact('Node.js'), fact('Rust', 'Nieistniejący cytat'), fact('SQL', 'Node.js', true)],
  experience: [
    fact(
      {
        company: 'Firma Testowa',
        role: 'Programista',
        from: '2020',
        to: '2024',
        technologies: ['Node.js'],
      },
      source
    ),
  ],
  education: [fact('Uczelnia Testowa')],
  languages: [fact('angielski B2')],
});

function setup(t, text, cvText = source) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  migrate(db);
  db.exec(`INSERT INTO job_briefs (id,title,stack_json,seniority) VALUES ('job','Test','[]','mid');
    INSERT INTO applications (id,job_brief_id,name,email,consent_version,consent_at,idempotency_key)
    VALUES ('app','job','Test','test@example.test','v1','2026-01-01','application');`);
  db.prepare(
    `INSERT INTO cv_files (id,application_id,storage_path,original_name,sha256,size_bytes,extracted_text,status)
    VALUES ('cv','app','synthetic.pdf','cv.pdf','synthetic',100,?,?)`
  ).run(cvText, cvText ? 'extracted' : 'needs_manual_review');
  let calls = 0;
  const gateway = createModelGateway(db, {
    provider: {
      name: 'fake',
      generate(input) {
        calls += 1;
        assert.equal(input.purpose, 'cv-profile');
        assert.ok(input.prompt.includes(source));
        return { text };
      },
    },
  });
  return { db, ...createCvProfiles(db, gateway), calls: () => calls };
}

test('parser zapisuje cały profil i weryfikuje dosłowne cytaty, zachowując uncertain modelu', async (t) => {
  const { db, parseCv, calls } = setup(t, JSON.stringify(profile()));
  const first = await parseCv('app', 'parse');
  assert.equal(first.status, 'completed');
  const expected = profile();
  expected.skills[1].uncertain = true;
  assert.deepEqual(first.profile, expected);
  const row = db.prepare('SELECT * FROM cv_profiles').get();
  assert.deepEqual(JSON.parse(row.profile_json), expected);
  assert.equal(row.status, 'completed');
  const facts = db.prepare('SELECT * FROM profile_facts ORDER BY rowid').all();
  assert.deepEqual(
    facts.map((item) => item.uncertain),
    [0, 1, 1, 0, 0, 0]
  );
  assert.deepEqual(
    facts.map((item) => item.category),
    ['skill', 'skill', 'skill', 'experience', 'education', 'language']
  );
  assert.deepEqual(JSON.parse(facts[3].value_json), expected.experience[0].value);
  assert.equal(facts[3].quote, source);
  assert.deepEqual(await parseCv('app', 'parse'), first);
  assert.equal(calls(), 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM cv_profiles').get().n, 1);
  await assert.rejects(parseCv('other-app', 'parse'), { status: 409 });
  assert.equal(db.prepare('SELECT stage FROM applications').get().stage, 'new');
});

test('błędny JSON lub schemat oznacza ręczny przegląd bez częściowych faktów', async (t) => {
  const invalid = ['{', 'null', '[]', '{}'];
  for (const change of [
    (p) => {
      p.skills = 'Node.js';
    },
    (p) => {
      p.languages[0].quote = '';
    },
    (p) => {
      delete p.education[0].quote;
    },
    (p) => {
      p.skills[0].uncertain = 'false';
    },
    (p) => {
      delete p.experience[0].value.company;
    },
    (p) => {
      p.experience[0].value.technologies = [42];
    },
    (p) => {
      p.experience[0].value.from = 2020;
    },
    (p) => {
      p.extra = [];
    },
  ]) {
    const candidate = profile();
    change(candidate);
    invalid.push(JSON.stringify(candidate));
  }
  for (const text of invalid) {
    const { db, parseCv, calls } = setup(t, text);
    await assert.rejects(parseCv('app', 'invalid'), { status: 422 });
    await assert.rejects(parseCv('app', 'invalid'), { status: 422 });
    assert.equal(calls(), 1);
    assert.equal(db.prepare('SELECT status FROM cv_profiles').get().status, 'needs_manual_review');
    assert.equal(db.prepare('SELECT count(*) AS n FROM cv_profiles').get().n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM profile_facts').get().n, 0);
  }
});

test('brak tekstu i za długie CV wymagają przeglądu bez wywołania dostawcy', async (t) => {
  for (const text of [null, source.repeat(200)]) {
    const { db, parseCv, calls } = setup(t, '{}', text);
    await assert.rejects(parseCv('app', 'no-text'), { status: 422 });
    assert.equal(calls(), 0);
    assert.equal(db.prepare('SELECT status FROM cv_profiles').get().status, 'needs_manual_review');
  }
});

test('pusty profil jest poprawny, cytaty nie są normalizowane', async (t) => {
  const empty = { skills: [], experience: [], education: [], languages: [] };
  const { parseCv } = setup(t, JSON.stringify(empty));
  assert.deepEqual((await parseCv('app', 'empty')).profile, empty);
  for (const quote of ['node.js', ' Node.js', 'Node.\njs']) {
    const candidate = { ...empty, skills: [fact('Node.js', quote)] };
    const parser = setup(t, JSON.stringify(candidate));
    assert.equal((await parser.parseCv('app', 'exact')).profile.skills[0].uncertain, true);
  }
});

test('zapis profilu i faktów jest atomowy; ponowienie korzysta z cache bramki', async (t) => {
  const { db, parseCv, calls } = setup(t, JSON.stringify(profile()));
  db.exec(
    "CREATE TRIGGER fail_fact BEFORE INSERT ON profile_facts BEGIN SELECT RAISE(ABORT, 'test rollback'); END"
  );
  await assert.rejects(parseCv('app', 'rollback'), /test rollback/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM cv_profiles').get().n, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM requests').get().n, 0);
  db.exec('DROP TRIGGER fail_fact');
  assert.equal((await parseCv('app', 'rollback')).status, 'completed');
  assert.equal(calls(), 1);
});

test('endpoint parsera wymaga uprawnień i zwraca profil lub błąd przeglądu', async (t) => {
  const keys = openKeys(':memory:');
  t.after(() => keys.close());
  const admin = keys.create('parser-admin', 'admin');
  const worker = keys.create('parser-worker', 'worker:outreach');
  const store = setup(t, JSON.stringify(profile()));
  const handler = createHandler({
    store,
    keys,
    sessions: createSessions('synthetic-password'),
    port: 4310,
  });
  async function post(credential, key = 'http-parse', origin) {
    const req = Readable.from(['{}']);
    Object.assign(req, {
      method: 'POST',
      url: '/api/v1/applications/app/parse-cv',
      headers: {
        host: 'localhost:4310',
        'content-type': 'application/json',
        'idempotency-key': key,
        authorization: `Bearer ${credential}`,
        ...(origin ? { origin } : {}),
      },
    });
    let status;
    let body;
    await handler(req, {
      setHeader(name, value) {
        assert.equal(typeof name, 'string');
        assert.equal(typeof value, 'string');
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
  assert.equal((await post('')).status, 401);
  assert.equal((await post(worker)).status, 403);
  assert.equal((await post(admin, 'bad-origin', 'https://example.test')).status, 403);
  assert.equal((await post(admin, '')).status, 400);
  assert.equal(store.calls(), 0);
  const result = await post(admin);
  assert.equal(result.status, 200);
  assert.equal(result.body.profile.skills[1].uncertain, true);
  assert.deepEqual(await post(admin), result);
  store.db.exec("UPDATE cv_files SET extracted_text=NULL, status='needs_manual_review'");
  const failed = await post(admin, 'manual');
  assert.equal(failed.status, 422);
  assert.match(failed.body.error, /ręczny przegląd/);
});

test('równoległe ponowienie nie nadpisuje profilu statusem ręcznego przeglądu', async (t) => {
  const { db, parseCv, calls } = setup(t, JSON.stringify(profile()));
  const first = parseCv('app', 'parallel');
  await assert.rejects(parseCv('app', 'parallel'), { status: 503 });
  const result = await first;
  assert.equal(result.status, 'completed');
  assert.deepEqual(await parseCv('app', 'parallel'), result);
  assert.equal(calls(), 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM cv_profiles').get().n, 1);
  await assert.rejects(parseCv('missing', 'missing'), { status: 404 });
});
