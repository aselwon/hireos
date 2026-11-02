export function runIdempotentTransaction(db, action, input, key, apply) {
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
