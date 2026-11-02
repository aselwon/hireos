import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createHandler } from '../lib/http.mjs';
import { openStore } from '../lib/store.mjs';

test('company landing is self-hosted and uses configured pricing', async (t) => {
  const store = openStore();
  t.after(() => store.close());
  const handler = createHandler({
    store,
    keys: { authenticate: () => null },
    sessions: { valid: () => false },
    port: 14317,
    pricing: '<wycena testowa>',
  });
  const request = async (route, { method = 'GET', body, headers = {} } = {}) => {
    const req = Readable.from(body ? [JSON.stringify(body)] : []);
    Object.assign(req, {
      method,
      url: route,
      headers: {
        host: '127.0.0.1:14317',
        ...Object.fromEntries(
          Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
        ),
      },
      socket: { remoteAddress: '127.0.0.1' },
    });
    let status;
    let response;
    const responseHeaders = new Map();
    await handler(req, {
      setHeader(name, value) {
        responseHeaders.set(name.toLowerCase(), value);
      },
      writeHead(code) {
        status = code;
      },
      end(value) {
        response = value;
      },
    });
    return { status, response: String(response || ''), responseHeaders };
  };
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.ok(page.response.includes('&lt;wycena testowa&gt;'));
  assert.ok(page.response.includes('AI nie odrzuca kandydatów'));
  assert.ok(!/https?:\/\//.test(page.response));
  const hiddenLead = await request('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'honeypot' },
    body: {
      company: 'Bot',
      contact: 'bot@example.test',
      position: 'Bot',
      consent: true,
      website: 'filled',
    },
  });
  assert.equal(hiddenLead.status, 202);
  const submittedLead = await request('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'http-lead' },
    body: {
      company: 'Firma HTTP',
      contact: 'kontakt@example.test',
      position: 'Developer',
      consent: true,
      website: '',
    },
  });
  assert.equal(submittedLead.status, 201);
  assert.ok(JSON.parse(submittedLead.response).id);
  const assets = [
    ['company.js', 'text/javascript'],
    ['company.css', 'text/css'],
  ];
  for (const [asset] of assets) {
    const result = await request(`/${asset}`);
    assert.equal(result.status, 200);
    assert.ok(!/https?:\/\//.test(result.response));
  }
  const files = ['company.html', 'company.js', 'company.css', 'privacy-firms.html'];
  for (const file of files) {
    const content = readFileSync(new URL(`../hireos/dist/${file}`, import.meta.url), 'utf8');
    assert.ok(!/https?:\/\//.test(content), file);
    assert.ok(!/\b(?:price|PLN|zł)\s*[:=]/i.test(content), file);
  }
});

test('lead consent is versioned, honeypot is ignored, and rate limit is enforced', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hireos-leads-'));
  const path = join(directory, 'leads.sqlite');
  const store = openStore(path);
  const db = new DatabaseSync(path);
  try {
    const base = {
      company: 'Firma Demo',
      contact: 'kontakt@example.test',
      position: 'Backend Developer',
      consent: true,
    };
    const first = store.createLead(base, 'lead-1', '127.0.0.1');
    assert.deepEqual(store.createLead(base, 'lead-1', '127.0.0.1'), first);
    const row = db
      .prepare('SELECT consent_version, consent_at FROM company_leads WHERE id=?')
      .get(first.id);
    assert.equal(row.consent_version, 'lead-v1');
    assert.ok(row.consent_at);
    assert.ok(
      !db
        .prepare('SELECT fingerprint FROM lead_requests WHERE idempotency_key=?')
        .get('lead-1')
        .fingerprint.includes(base.contact)
    );
    assert.throws(
      () => store.createLead({ ...base, consent: false }, 'lead-invalid', '127.0.0.2'),
      /zgoda/
    );
    for (let index = 0; index < 4; index += 1) {
      store.createLead(base, `lead-${index + 2}`, '127.0.0.1');
    }
    assert.throws(() => store.createLead(base, 'lead-over-limit', '127.0.0.1'), { status: 429 });
    const now = new Date();
    store.createLead(
      base,
      'lead-after-window',
      '127.0.0.1',
      new Date(now.getTime() + 60 * 60 * 1000 + 1)
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM company_leads').get().count, 6);
  } finally {
    db.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('lead can be managed, converted idempotently and expired by configured retention', () => {
  const store = openStore();
  try {
    const lead = store.createLead(
      {
        company: 'Firma Syntetyczna',
        contact: 'osoba@example.test',
        position: 'Backend',
        consent: true,
      },
      'manage-lead',
      '127.0.0.2'
    );
    const updated = store.updateLead(
      lead.id,
      { status: 'offer', notes: 'Oferta wysłana' },
      'update-lead'
    );
    assert.equal(updated.status, 'offer');
    const terms = {
      nip: '0000000000',
      billingModel: 'success_fee',
      feeValue: 1500,
      advanceGrosz: 25000,
    };
    const client = store.convertLead(lead.id, terms, 'convert-lead');
    assert.equal(client.name, 'Firma Syntetyczna');
    assert.equal(store.convertLead(lead.id, terms, 'convert-lead').id, client.id);
    assert.equal(store.listClients().filter(({ id }) => id === client.id).length, 1);
    assert.throws(() => store.convertLead(lead.id, terms, 'convert-again'), { status: 404 });
    const invalidLead = store.createLead(
      { company: 'Firma Druga', contact: 'x@example.test', position: 'QA', consent: true },
      'invalid-lead',
      '127.0.0.4'
    );
    assert.throws(
      () => store.convertLead(invalidLead.id, { ...terms, nip: 'bad' }, 'convert-invalid'),
      { status: 400 }
    );
    const old = store.createLead(
      { company: 'Stary Lead', contact: 'kontakt@example.test', position: 'DevOps', consent: true },
      'old-lead',
      '127.0.0.3',
      new Date('2020-01-01T00:00:00.000Z')
    );
    assert.deepEqual(store.purgeOldLeads(30, new Date('2020-03-01T00:00:00.000Z')), {
      leads: 1,
      days: 30,
    });
    assert.equal(
      store.listLeads().some(({ id }) => id === old.id),
      false
    );
    assert.equal(
      store.listLeads().some(({ id }) => id === lead.id),
      true
    );
  } finally {
    store.close();
  }
});
