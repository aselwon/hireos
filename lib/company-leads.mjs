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
  return { createLead };
}
