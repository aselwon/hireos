import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { createOutreachLimits } from './outreach-limits.mjs';
import { createOutreachLive } from './outreach-live.mjs';

const leaseDuration = 60_000;
const results = ['sent', 'replied', 'needs_intervention', 'failed', 'unresolved', 'refused'];
const verificationResults = ['verified_not_sent', 'verified_sent'];
const optOutFooter = 'Jeśli nie chcesz otrzymywać od nas wiadomości, zrezygnuj z kontaktu: ';
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
function optOut(db, now, token) {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) {
    return false;
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const hash = tokenHash(token);
    const record = db
      .prepare('SELECT application_id, used_at FROM outreach_opt_out_tokens WHERE token_hash=?')
      .get(hash);
    if (!record || record.used_at) {
      db.exec('COMMIT');
      return false;
    }
    db.prepare('UPDATE applications SET do_not_contact=1 WHERE id=?').run(record.application_id);
    db.prepare(
      "UPDATE outreach_tasks SET status='cancelled', assigned_api_key_id=NULL, lease_until=NULL, lease_id=NULL WHERE application_id=? AND status IN ('queued','leased','unresolved')"
    ).run(record.application_id);
    db.prepare('UPDATE outreach_opt_out_tokens SET used_at=? WHERE token_hash=?').run(
      new Date(now()).toISOString(),
      hash
    );
    db.exec('COMMIT');
    return true;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
function text(value, max = 128) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}
function createTask(db, input, key, publicBaseUrl) {
  if (
    !text(input.application_id) ||
    !text(input.job_brief_id) ||
    !text(input.context, 8000) ||
    !text(input.contact_rules, 4000) ||
    input.contact_rules_approved !== true ||
    (input.control_recipient !== undefined && typeof input.control_recipient !== 'boolean')
  ) {
    fail(400, 'Podaj kandydata, rekrutację, kontekst i zatwierdzone zasady kontaktu.');
  }
  const application = db
    .prepare('SELECT id, do_not_contact FROM applications WHERE id=? AND job_brief_id=?')
    .get(input.application_id, input.job_brief_id);
  if (!application) {
    fail(400, 'Kandydat nie należy do rekrutacji.');
  }
  if (application.do_not_contact) {
    fail(409, 'Kandydat nie życzy sobie kontaktu.');
  }
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const optOutUrl = `${publicBaseUrl}/opt-out/${token}`;
  const payload = JSON.stringify({
    job_brief_id: input.job_brief_id,
    context: input.context,
    contact_rules: input.contact_rules,
    contact_rules_approved: true,
    control_recipient: input.control_recipient === true,
    opt_out_url: optOutUrl,
    message_footer: `${optOutFooter}${optOutUrl}`,
  });
  db.prepare('INSERT INTO outreach_opt_out_tokens (token_hash, application_id) VALUES (?, ?)').run(
    tokenHash(token),
    input.application_id
  );
  db.prepare(
    'INSERT INTO outreach_tasks (id,application_id,message_id,payload_json,idempotency_key) VALUES (?,?,?,?,?)'
  ).run(id, input.application_id, randomUUID(), payload, key);
  return id;
}
function createControls(db, visible, live) {
  function preflight(row, checkLive = true) {
    if (checkLive && !live.allowed(row)) {
      return { allowed: false, reason: 'control_test_required' };
    }
    const state = db
      .prepare(
        `SELECT a.paused AS conversation_paused, a.human_takeover, a.do_not_contact,
                b.paused AS recruitment_paused
         FROM applications a JOIN job_briefs b ON b.id=a.job_brief_id WHERE a.id=?`
      )
      .get(row.application_id);
    const reasons = [
      [state?.do_not_contact, 'do_not_contact'],
      [state?.recruitment_paused, 'recruitment_paused'],
      [state?.conversation_paused, 'conversation_paused'],
      [state?.human_takeover, 'human_takeover'],
      [row.status === 'refused', 'refused'],
    ];
    const reason = reasons.find(([blocked]) => blocked)?.[1] ?? null;
    return { allowed: reason === null, reason };
  }
  const getPreflight = (id, principal) => preflight(visible(id, principal));
  function setControl(applicationId, input) {
    if (
      !input ||
      ['paused', 'human_takeover'].some(
        (field) => input[field] !== undefined && typeof input[field] !== 'boolean'
      )
    ) {
      fail(400, 'Pauza i przejęcie muszą być wartościami logicznymi.');
    }
    if (!db.prepare('SELECT id FROM applications WHERE id=?').get(applicationId)) {
      fail(404, 'Nie znaleziono kandydata.');
    }
    for (const field of ['paused', 'human_takeover']) {
      if (input[field] !== undefined) {
        db.prepare(`UPDATE applications SET ${field}=? WHERE id=?`).run(
          Number(input[field]),
          applicationId
        );
      }
    }
    return { ok: true };
  }
  function setRecruitmentPause(briefId, input) {
    if (typeof input?.paused !== 'boolean') {
      fail(400, 'Pauza rekrutacji musi być wartością logiczną.');
    }
    const result = db
      .prepare('UPDATE job_briefs SET paused=? WHERE id=?')
      .run(Number(input.paused), briefId);
    if (!result.changes) {
      fail(404, 'Nie znaleziono rekrutacji.');
    }
    return { ok: true };
  }
  return { preflight, getPreflight, setControl, setRecruitmentPause };
}

function validateRequest(action, input, key, principal) {
  if (action === 'live' && principal.kind !== 'session') {
    fail(403, 'Wymagana sesja rekrutera.');
  }
  if (!text(key)) {
    fail(400, 'Wymagany Idempotency-Key (1–128 znaków).');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail(400, 'Wymagany obiekt JSON.');
  }
  if (
    ['create', 'settings', 'live'].includes(action)
      ? principal.scope !== 'admin'
      : principal.scope !== 'worker:outreach'
  ) {
    fail(403, 'Niedozwolony zakres.');
  }
  if (input.worker_id !== undefined && input.worker_id !== principal.id) {
    fail(403, 'Niezgodny worker_id.');
  }
}

const serialize = (row) =>
  row && {
    task_id: row.id,
    application_id: row.application_id,
    message_id: row.message_id,
    ...JSON.parse(row.payload_json),
    status: row.status,
    worker_id: row.assigned_api_key_id,
    lease_until: row.lease_until,
    lease_id: row.lease_id,
  };

export function createOutreach(
  db,
  now = Date.now,
  allowlist = process.env.OUTREACH_CONTROL_ALLOWLIST || ''
) {
  const live = createOutreachLive(db, allowlist);
  const get = (id) => db.prepare('SELECT * FROM outreach_tasks WHERE id=?').get(id);
  function visible(id, principal) {
    const row = get(id);
    if (!row || (principal.scope !== 'admin' && row.assigned_api_key_id !== principal.id)) {
      fail(404, 'Nie znaleziono zadania.');
    }
    return row;
  }
  const controls = createControls(db, visible, live);
  const limits = createOutreachLimits(db);
  function read(id, principal) {
    if (!id) {
      const rows =
        principal.scope === 'admin'
          ? db.prepare('SELECT * FROM outreach_tasks ORDER BY created_at, id').all()
          : db
              .prepare(
                'SELECT * FROM outreach_tasks WHERE assigned_api_key_id=? ORDER BY created_at, id'
              )
              .all(principal.id);
      return { tasks: rows.map(serialize) };
    }
    const row = visible(id, principal);
    const attempts = db
      .prepare(
        'SELECT id, api_key_id AS worker_id, result, message, created_at FROM task_attempts WHERE outreach_task_id=? ORDER BY created_at, id'
      )
      .all(id);
    return { task: serialize(row), attempts };
  }
  function create(input, key, publicBaseUrl) {
    return { task: serialize(get(createTask(db, input, key, publicBaseUrl))) };
  }
  function claim(principal, timestamp) {
    // Odzyskanie rezerwacji i wybór następnej odbywają się pod tym samym zamkiem zapisu.
    db.prepare(
      "UPDATE outreach_tasks SET status='queued', assigned_api_key_id=NULL, lease_until=NULL, lease_id=NULL WHERE status='leased' AND lease_until<=?"
    ).run(timestamp);
    const rows = db
      .prepare(
        `SELECT t.*, a.job_brief_id FROM outreach_tasks t JOIN applications a ON a.id=t.application_id
         JOIN job_briefs b ON b.id=a.job_brief_id WHERE t.status='queued'
         AND a.paused=0 AND a.human_takeover=0 AND a.do_not_contact=0 AND b.paused=0
         AND json_extract(t.payload_json, '$.opt_out_url') IS NOT NULL
         AND json_extract(t.payload_json, '$.message_footer') IS NOT NULL
         ORDER BY t.created_at, t.id`
      )
      .all();
    const row = rows.find(live.allowed);
    if (!row && rows.length) {
      live.requireAllowed(rows[0]);
    }
    if (!row) {
      return { task: null };
    }
    limits.reserve(row, timestamp);
    db.prepare(
      "UPDATE outreach_tasks SET status='leased', assigned_api_key_id=?, lease_until=?, lease_id=? WHERE id=?"
    ).run(
      principal.id,
      new Date(Date.parse(timestamp) + leaseDuration).toISOString(),
      randomUUID(),
      row.id
    );
    return { task: serialize(get(row.id)) };
  }
  function update(action, row, input, principal, key, timestamp) {
    const check = controls.preflight(row);
    if (!check.allowed) {
      fail(409, `Operacja zablokowana: ${check.reason}.`);
    }
    if (
      input.task_id !== row.id ||
      input.message_id !== row.message_id ||
      input.lease_id !== row.lease_id
    ) {
      fail(409, 'Niezgodne task_id, message_id lub lease_id.');
    }
    const verification = verificationResults.includes(input.result);
    if (verification && row.status === 'unresolved') {
      if (!text(input.message, 4000)) {
        fail(400, 'Podaj opis weryfikacji.');
      }
      db.prepare(
        'INSERT INTO task_attempts (id,outreach_task_id,api_key_id,result,message,idempotency_key) VALUES (?,?,?,?,?,?)'
      ).run(randomUUID(), row.id, principal.id, input.result, input.message, key);
      db.prepare(
        'UPDATE outreach_tasks SET status=?, lease_until=NULL, lease_id=NULL WHERE id=?'
      ).run(input.result === 'verified_not_sent' ? 'queued' : 'sent', row.id);
      return { task: serialize(get(row.id)) };
    }
    if (row.status !== 'leased' || row.lease_until <= timestamp) {
      fail(409, 'Rezerwacja nie jest aktywna.');
    }
    if (action === 'heartbeat') {
      db.prepare('UPDATE outreach_tasks SET lease_until=? WHERE id=?').run(
        new Date(Date.parse(timestamp) + leaseDuration).toISOString(),
        row.id
      );
    } else {
      if (!results.includes(input.result) || !text(input.message, 4000)) {
        fail(400, 'Podaj poprawny wynik i opis próby.');
      }
      db.prepare(
        'INSERT INTO task_attempts (id,outreach_task_id,api_key_id,result,message,idempotency_key) VALUES (?,?,?,?,?,?)'
      ).run(randomUUID(), row.id, principal.id, input.result, input.message, key);
      db.prepare('UPDATE outreach_tasks SET status=?, lease_until=NULL WHERE id=?').run(
        input.result,
        row.id
      );
      if (input.result === 'refused') {
        db.prepare('UPDATE applications SET do_not_contact=1 WHERE id=?').run(row.application_id);
      }
    }
    return { task: serialize(get(row.id)) };
  }
  function validateReplay(id, principal) {
    const current = visible(id, principal);
    if (principal.scope !== 'admin') {
      live.requireAllowed(current);
    }
    if (!controls.preflight(current, false).allowed) {
      fail(409, 'Kontakt zablokowany.');
    }
  }
  function mutate(action, id, input, key, principal, publicBaseUrl = 'http://localhost') {
    validateRequest(action, input, key, principal);
    const requestKey = JSON.stringify(['outreach', principal.id, key]);
    // Kolejność pól obiektu nie zmienia znaczenia ponowionego żądania.
    const fingerprint = JSON.stringify([
      action,
      id,
      Object.entries(input).sort(([a], [b]) => a.localeCompare(b)),
    ]);
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = id ? visible(id, principal) : null;
      const cached = db.prepare('SELECT * FROM requests WHERE key=?').get(requestKey);
      if (cached && cached.fingerprint !== fingerprint) {
        fail(409, 'Klucz idempotencji użyty dla innego żądania.');
      }
      let response;
      if (cached) {
        response = JSON.parse(cached.response);
        // Stary claim nie ujawnia danych zadania przekazanego innemu wykonawcy.
        if (['claim', 'create'].includes(action) && response.task) {
          validateReplay(response.task.task_id, principal);
        }
      } else {
        const timestamp = new Date(now()).toISOString();
        if (action === 'live') {
          response = live.save(input, requestKey, principal, timestamp);
        } else if (action === 'settings') {
          response = limits.saveSettings(input, requestKey, principal, timestamp);
        } else if (action === 'create') {
          response = create(input, requestKey, publicBaseUrl);
        } else if (action === 'claim') {
          response = claim(principal, timestamp);
        } else {
          response = update(action, row, input, principal, requestKey, timestamp);
          limits.recordResult(action, row.id, input.result, timestamp);
        }
        db.prepare('INSERT INTO requests VALUES (?,?,?)').run(
          requestKey,
          fingerprint,
          JSON.stringify(response)
        );
      }
      db.exec('COMMIT');
      return response;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return {
    read,
    mutate,
    optOut: (token) => optOut(db, now, token),
    readLive: live.read,
    readSettings: limits.readSettings,
    ...controls,
  };
}
