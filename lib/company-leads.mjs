import { createHash, randomUUID } from 'node:crypto';

function validateLead(input, key) {
  if (typeof key !== 'string' || !key || key.length > 128) {
    throw Object.assign(new Error('Wymagany poprawny Idempotency-Key.'), { status: 400 });
  }
  for (const [field, label] of [
    ['company', 'Firma'],
    ['contact', 'Kontakt'],
    ['position', 'Stanowisko'],
  ]) {
    if (
      typeof input?.[field] !== 'string' ||
      !input[field].trim() ||
      input[field].trim().length > 200
    ) {
      throw Object.assign(new Error(`${label} jest wymagane (maks. 200 znaków).`), {
        status: 400,
      });
    }
  }
  if (input.consent !== true) {
    throw Object.assign(new Error('Wymagana zgoda na kontakt w sprawie zapytania.'), {
      status: 400,
    });
  }
  return Object.fromEntries(
    ['company', 'contact', 'position'].map((field) => [field, input[field].trim()])
  );
}

export function createCompanyLeads(db) {
  const statuses = ['new', 'contacted', 'offer', 'won', 'lost'];
  function createLead(input, key, address, now = new Date()) {
    const clean = validateLead(input, key);
    const fingerprint = createHash('sha256').update(JSON.stringify(clean)).digest('hex');
    const addressHash = createHash('sha256')
      .update(String(address || 'unknown'))
      .digest('hex');
    const createdAt = now.toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      const cached = db
        .prepare('SELECT fingerprint, response_json FROM lead_requests WHERE idempotency_key=?')
        .get(key);
      if (cached) {
        if (cached.fingerprint !== fingerprint) {
          throw Object.assign(
            new Error('Klucz idempotencji został już użyty dla innej operacji.'),
            { status: 409 }
          );
        }
        db.exec('COMMIT');
        return JSON.parse(cached.response_json);
      }
      db.prepare('DELETE FROM lead_rate_limits WHERE created_at < ?').run(
        new Date(now.getTime() - 60 * 60 * 1000).toISOString()
      );
      const requests = db
        .prepare('SELECT COUNT(*) AS count FROM lead_rate_limits WHERE address_hash=?')
        .get(addressHash).count;
      if (requests >= 5) {
        throw Object.assign(
          new Error('Limit zapytań został osiągnięty. Spróbuj ponownie później.'),
          { status: 429 }
        );
      }
      const id = randomUUID();
      db.prepare(
        'INSERT INTO company_leads (id,company,contact,position,consent_version,consent_at,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?,?)'
      ).run(id, clean.company, clean.contact, clean.position, 'lead-v1', createdAt, key, createdAt);
      db.prepare('INSERT INTO lead_rate_limits VALUES (?,?)').run(addressHash, createdAt);
      const result = { id };
      db.prepare('INSERT INTO lead_requests VALUES (?,?,?,?)').run(
        key,
        fingerprint,
        JSON.stringify(result),
        createdAt
      );
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function updateLead(id, input, key) {
    if (typeof key !== 'string' || !key.trim() || key.length > 128) {
      throw Object.assign(new Error('Wymagany poprawny Idempotency-Key.'), { status: 400 });
    }
    if (
      !input ||
      typeof input !== 'object' ||
      !statuses.includes(input.status) ||
      typeof input.notes !== 'string' ||
      input.notes.length > 5000
    ) {
      throw Object.assign(new Error('Wybierz status i notatki do 5000 znaków.'), { status: 400 });
    }
    const fingerprint = JSON.stringify({ id, input });
    db.exec('BEGIN IMMEDIATE');
    try {
      const cached = db
        .prepare(
          'SELECT fingerprint,response_json FROM lead_management_requests WHERE idempotency_key=?'
        )
        .get(key);
      if (cached) {
        if (cached.fingerprint !== fingerprint) {
          throw Object.assign(new Error('Klucz idempotencji użyty dla innej operacji.'), {
            status: 409,
          });
        }
        db.exec('COMMIT');
        return JSON.parse(cached.response_json);
      }
      const lead = db
        .prepare('SELECT id FROM company_leads WHERE id=? AND client_id IS NULL')
        .get(id);
      if (!lead) {
        throw Object.assign(new Error('Nie znaleziono nieprzekonwertowanego leada.'), {
          status: 404,
        });
      }
      db.prepare('UPDATE company_leads SET status=?,notes=? WHERE id=?').run(
        input.status,
        input.notes.trim(),
        id
      );
      const result = db.prepare('SELECT * FROM company_leads WHERE id=?').get(id);
      db.prepare('INSERT INTO lead_management_requests VALUES (?,?,?)').run(
        key,
        fingerprint,
        JSON.stringify(result)
      );
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function convertLead(id, input, key) {
    if (typeof key !== 'string' || !key.trim() || key.length > 128) {
      throw new Error('Wymagany poprawny Idempotency-Key.');
    }
    const fingerprint = JSON.stringify({ id, input });
    db.exec('BEGIN IMMEDIATE');
    try {
      const cached = db
        .prepare(
          'SELECT fingerprint,response_json FROM lead_management_requests WHERE idempotency_key=?'
        )
        .get(key);
      if (cached) {
        if (cached.fingerprint !== fingerprint) {
          throw Object.assign(new Error('Klucz idempotencji użyty dla innej operacji.'), {
            status: 409,
          });
        }
        db.exec('COMMIT');
        return JSON.parse(cached.response_json);
      }
      const lead = db
        .prepare('SELECT * FROM company_leads WHERE id=? AND client_id IS NULL')
        .get(id);
      if (!lead) {
        throw Object.assign(new Error('Nie znaleziono nieprzekonwertowanego leada.'), {
          status: 404,
        });
      }
      if (
        !/^\d{10}$/.test(input?.nip || '') ||
        !['success_fee', 'fixed_fee'].includes(input.billingModel) ||
        !Number.isSafeInteger(input.feeValue) ||
        input.feeValue < 0 ||
        (input.billingModel === 'success_fee' && input.feeValue > 10000) ||
        !Number.isSafeInteger(input.advanceGrosz) ||
        input.advanceGrosz < 0
      ) {
        throw Object.assign(new Error('Uzupełnij poprawny NIP i warunki rozliczenia.'), {
          status: 400,
        });
      }
      const clientId = randomUUID();
      db.prepare(
        'INSERT INTO clients (id,name,nip,contact,billing_model,fee_value,advance_grosz) VALUES (?,?,?,?,?,?,?)'
      ).run(
        clientId,
        lead.company,
        input.nip,
        lead.contact,
        input.billingModel,
        input.feeValue,
        input.advanceGrosz
      );
      db.prepare("UPDATE company_leads SET client_id=?,status='won' WHERE id=?").run(clientId, id);
      const result = db.prepare('SELECT * FROM clients WHERE id=?').get(clientId);
      db.prepare('INSERT INTO lead_management_requests VALUES (?,?,?)').run(
        key,
        fingerprint,
        JSON.stringify(result)
      );
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return {
    createLead,
    listLeads: () => db.prepare('SELECT * FROM company_leads ORDER BY created_at DESC').all(),
    updateLead,
    convertLead,
  };
}
