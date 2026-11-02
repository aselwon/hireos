import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, unlinkSync } from 'node:fs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

// Jawna mapa obejmuje również relacje pośrednie oraz cache sprzed migracji 007.
function collect(db, applicationId) {
  const tables = {};
  const rows = (table, column, ids) => {
    tables[table] = ids.length
      ? db
          .prepare(`SELECT * FROM ${table} WHERE ${column} IN (${ids.map(() => '?').join(',')})`)
          .all(...ids)
      : [];
    return tables[table].map((row) => row.id);
  };
  rows('applications', 'id', [applicationId]);
  if (!tables.applications.length) {
    fail(404, 'Nie znaleziono kandydata.');
  }
  const files = rows('cv_files', 'application_id', [applicationId]);
  rows('cv_processing_jobs', 'cv_file_id', files);
  const profiles = rows('cv_profiles', 'cv_file_id', files);
  rows('profile_facts', 'cv_profile_id', profiles);
  rows('screening_reports', 'cv_profile_id', profiles);
  rows('decisions', 'application_id', [applicationId]);
  const tasks = rows('outreach_tasks', 'application_id', [applicationId]);
  rows('task_attempts', 'outreach_task_id', tasks);
  rows('data_requests', 'application_id', [applicationId]);
  const identifiers = new Set(
    Object.values(tables)
      .flat()
      .flatMap((row) => [row.id, row.idempotency_key])
      .filter(Boolean)
  );
  const references = (value) => {
    if (typeof value === 'string') {
      return identifiers.has(value);
    }
    if (value && typeof value === 'object') {
      return Object.values(value).some(references);
    }
    return false;
  };
  tables.requests = db
    .prepare('SELECT * FROM requests')
    .all()
    .filter(
      (row) =>
        identifiers.has(row.key) ||
        references(JSON.parse(row.fingerprint)) ||
        references(JSON.parse(row.response))
    );
  const modelKeys = new Set(
    tables.requests.flatMap(({ key }) =>
      ['cv-profile', 'screening'].map((purpose) => hash(`${purpose}:${key}`))
    )
  );
  tables.model_calls = db
    .prepare('SELECT * FROM model_calls')
    .all()
    .filter((row) => row.application_id === applicationId || modelKeys.has(row.idempotency_key));
  tables.audit_events = db
    .prepare('SELECT * FROM audit_events')
    .all()
    .filter(
      (row) =>
        identifiers.has(row.entity_id) ||
        identifiers.has(row.idempotency_key) ||
        references(JSON.parse(row.detail_json))
    );
  rows('job_briefs', 'id', [tables.applications[0].job_brief_id]);
  rows('requirements', 'job_brief_id', [tables.applications[0].job_brief_id]);
  return tables;
}

function erase(db, tables) {
  if (tables.model_calls.some((row) => row.status === 'reserved')) {
    fail(409, 'Trwa analiza CV. Ponów usunięcie po zakończeniu przetwarzania.');
  }
  // Usuwanie jest synchroniczne pod zamkiem zapisu. Błąd pliku wycofuje bazę;
  // ponowienie toleruje ENOENT po częściowym usunięciu plików lub awarii procesu.
  for (const file of tables.cv_files) {
    try {
      unlinkSync(file.storage_path);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  for (const row of tables.model_calls) {
    // Zachowujemy koszt, aby usunięcie danych nie zwalniało dziennego limitu AI.
    db.prepare(
      'UPDATE model_calls SET application_id=NULL, response_json=NULL, fingerprint=NULL, idempotency_key=?, purpose=? WHERE id=?'
    ).run(randomUUID(), 'erased', row.id);
  }
  for (const row of tables.requests) {
    db.prepare('DELETE FROM requests WHERE key=?').run(row.key);
  }
  for (const row of tables.data_requests) {
    db.prepare('UPDATE data_requests SET application_id=NULL WHERE id=?').run(row.id);
  }
  for (const table of [
    'audit_events',
    'task_attempts',
    'outreach_tasks',
    'decisions',
    'screening_reports',
    'profile_facts',
    'cv_profiles',
    'cv_files',
    'applications',
  ]) {
    for (const row of tables[table]) {
      db.prepare(`DELETE FROM ${table} WHERE id=?`).run(row.id);
    }
  }
}

function validateRequest(input, key) {
  if (typeof key !== 'string' || !key.trim() || key.length > 128) {
    fail(400, 'Wymagany Idempotency-Key.');
  }
  if (!['access', 'erase', 'object'].includes(input?.kind)) {
    fail(400, 'Niepoprawny rodzaj żądania.');
  }
  const received = new Date(input.receivedAt);
  if (
    typeof input.receivedAt !== 'string' ||
    Number.isNaN(received.getTime()) ||
    received > new Date()
  ) {
    fail(400, 'Podaj poprawną datę wpłynięcia żądania, nie późniejszą niż teraz.');
  }
  return received;
}

function register(db, applicationId, kind, received, key, fingerprint, data) {
  const record = {
    id: randomUUID(),
    kind,
    received_at: received.toISOString(),
    due_at: new Date(received.getTime() + 30 * 86400000).toISOString(),
    completed_at: new Date().toISOString(),
  };
  if (kind === 'erase') {
    erase(db, data);
  }
  if (kind === 'object') {
    db.prepare('UPDATE applications SET do_not_contact=1 WHERE id=?').run(applicationId);
  }
  db.prepare('INSERT INTO data_requests VALUES (?,?,?,?,?,?,?,?)').run(
    record.id,
    kind === 'erase' ? null : applicationId,
    record.kind,
    record.received_at,
    record.due_at,
    record.completed_at,
    hash(key),
    fingerprint
  );
  if (kind === 'erase') {
    db.prepare(
      'INSERT INTO audit_events (id,actor,action,entity_type,entity_id,detail_json,idempotency_key) VALUES (?,?,?,?,?,?,?)'
    ).run(randomUUID(), 'system', 'data.erased', 'data_request', record.id, '{}', randomUUID());
  }
  return record;
}

export function createDataRights(db) {
  const list = (applicationId) =>
    db
      .prepare(
        'SELECT id, kind, received_at, due_at, completed_at FROM data_requests WHERE application_id=? ORDER BY received_at, id'
      )
      .all(applicationId);
  function execute(applicationId, input, key) {
    const received = validateRequest(input, key);
    const fingerprint = hash(JSON.stringify([applicationId, input.kind, received.toISOString()]));
    db.exec('BEGIN IMMEDIATE');
    try {
      let record = db.prepare('SELECT * FROM data_requests WHERE key_hash=?').get(hash(key));
      if (record && record.fingerprint !== fingerprint) {
        fail(409, 'Klucz idempotencji użyty dla innego żądania.');
      }
      let data;
      if (!record || input.kind === 'access') {
        data = collect(db, applicationId);
        if (!record) {
          record = register(db, applicationId, input.kind, received, key, fingerprint, data);
        }
      }
      let archive;
      if (input.kind === 'access') {
        data.data_requests = db
          .prepare('SELECT * FROM data_requests WHERE application_id=?')
          .all(applicationId);
        archive = {
          tables: data,
          files: data.cv_files.map((file) => ({
            name: file.original_name,
            cvFileId: file.id,
            encoding: 'base64',
            content: readFileSync(file.storage_path).toString('base64'),
          })),
        };
      }
      db.exec('COMMIT');
      return {
        request: {
          id: record.id,
          kind: record.kind,
          received_at: record.received_at,
          due_at: record.due_at,
          completed_at: record.completed_at,
        },
        ...(archive ? { archive } : {}),
      };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return { list, execute };
}
