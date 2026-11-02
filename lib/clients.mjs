import { randomUUID } from 'node:crypto';

function validateClient(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Podaj dane klienta.');
  }
  for (const [field, limit] of [
    ['name', 160],
    ['contact', 1000],
  ]) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > limit) {
      throw new Error('Podaj nazwę (do 160 znaków) i kontakt (do 1000 znaków).');
    }
  }
  if (typeof input.nip !== 'string' || !/^\d{10}$/.test(input.nip)) {
    throw new Error('NIP musi zawierać 10 cyfr.');
  }
  if (
    !['success_fee', 'fixed_fee'].includes(input.billingModel) ||
    !Number.isSafeInteger(input.feeValue) ||
    input.feeValue < 0 ||
    (input.billingModel === 'success_fee' && input.feeValue > 10000) ||
    !Number.isSafeInteger(input.advanceGrosz) ||
    input.advanceGrosz < 0
  ) {
    throw new Error('Podaj model rozliczenia, nieujemną opłatę i zaliczkę; success fee: 0–100%.');
  }
}

export function createClients(db) {
  function transaction(action, input, key, apply) {
    if (typeof key !== 'string' || !key.trim() || key.length > 128) {
      throw new Error('Wymagany poprawny Idempotency-Key.');
    }
    const fingerprint = JSON.stringify({ action, input });
    db.exec('BEGIN IMMEDIATE');
    try {
      const cached = db.prepare('SELECT * FROM requests WHERE key=?').get(key);
      if (cached && cached.fingerprint !== fingerprint) {
        throw new Error('Klucz idempotencji został już użyty dla innej operacji.');
      }
      const result = cached ? JSON.parse(cached.response) : apply();
      if (!cached) {
        db.prepare('INSERT INTO requests VALUES (?,?,?)').run(
          key,
          fingerprint,
          JSON.stringify(result)
        );
      }
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return {
    listClients: () => db.prepare('SELECT * FROM clients ORDER BY name, id').all(),
    createClient(input, key) {
      validateClient(input);
      return transaction('client:create', input, key, () => {
        const id = randomUUID();
        db.prepare(
          'INSERT INTO clients (id,name,nip,contact,billing_model,fee_value,advance_grosz) VALUES (?,?,?,?,?,?,?)'
        ).run(
          id,
          input.name.trim(),
          input.nip,
          input.contact.trim(),
          input.billingModel,
          input.feeValue,
          input.advanceGrosz
        );
        return db.prepare('SELECT * FROM clients WHERE id=?').get(id);
      });
    },
    assignClient(briefId, input, key) {
      return transaction('client:assign', { briefId, input }, key, () => {
        if (!db.prepare('SELECT id FROM job_briefs WHERE id=?').get(briefId)) {
          throw Object.assign(new Error('Nie znaleziono rekrutacji.'), { status: 404 });
        }
        if (
          !input ||
          (input.clientId !== null &&
            (typeof input.clientId !== 'string' ||
              !db.prepare('SELECT id FROM clients WHERE id=?').get(input.clientId)))
        ) {
          throw new Error('Wybierz istniejącego klienta lub brak klienta.');
        }
        db.prepare('UPDATE job_briefs SET client_id=? WHERE id=?').run(input.clientId, briefId);
        return { id: briefId, client_id: input.clientId };
      });
    },
  };
}
