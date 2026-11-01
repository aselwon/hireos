import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';

export function retentionDays(value = process.env.RETENTION_DAYS) {
  const days = value === undefined ? 90 : Number(value);
  if (!Number.isSafeInteger(days) || days < 1) {
    throw new Error('RETENTION_DAYS musi być dodatnią liczbą całkowitą.');
  }
  return days;
}

export async function purgeRejectedCv(db, { days = retentionDays(), now = new Date() } = {}) {
  if (!Number.isSafeInteger(days) || days < 1 || Number.isNaN(now.getTime())) {
    throw new Error('Niepoprawne ustawienia retencji.');
  }
  const cutoff = new Date(now.getTime() - days * 86400000).toISOString();
  const eligible = db
    .prepare(
      `SELECT a.id FROM applications a JOIN job_briefs j ON j.id=a.job_brief_id
    WHERE a.name<>'[usunięto]' AND ((j.status='closed' AND j.closed_at IS NOT NULL AND
      ((a.future_recruitment_consent=0 AND j.closed_at<=?) OR
       (a.future_recruitment_consent=1 AND a.consent_at<=?)))
    OR (a.stage='rejected' AND EXISTS (
      SELECT 1 FROM decisions d WHERE d.application_id=a.id AND d.outcome='rejected'
        AND d.created_at<=? AND d.created_at=(SELECT MAX(latest.created_at) FROM decisions latest
          WHERE latest.application_id=a.id))))`
    )
    .all(cutoff, cutoff, cutoff);
  const candidates = eligible.map(({ id }) => id);
  const files = candidates.flatMap((id) =>
    db.prepare('SELECT id, storage_path AS path FROM cv_files WHERE application_id=?').all(id)
  );
  const outreachTasks = candidates.reduce(
    (total, id) =>
      total +
      db.prepare('SELECT count(*) AS count FROM outreach_tasks WHERE application_id=?').get(id)
        .count,
    0
  );
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const { id } of files) {
      db.prepare(
        'DELETE FROM screening_reports WHERE cv_profile_id IN (SELECT id FROM cv_profiles WHERE cv_file_id=?)'
      ).run(id);
      db.prepare(
        'DELETE FROM profile_facts WHERE cv_profile_id IN (SELECT id FROM cv_profiles WHERE cv_file_id=?)'
      ).run(id);
      db.prepare('DELETE FROM cv_profiles WHERE cv_file_id=?').run(id);
      db.prepare('DELETE FROM cv_files WHERE id=?').run(id);
    }
    const redact = db.prepare(
      "UPDATE applications SET name='[usunięto]', email='[usunięto]' WHERE id=?"
    );
    for (const id of candidates) {
      redact.run(id);
    }
    const findDecisions = db.prepare(
      'SELECT id, application_id, idempotency_key FROM decisions WHERE application_id=?'
    );
    const decisions = candidates.flatMap((id) => findDecisions.all(id));
    const redactDecision = db.prepare(
      "UPDATE decisions SET reason='[usunięto przez retencję]' WHERE id=?"
    );
    const redactDecisionAudit = db.prepare(
      "UPDATE audit_events SET detail_json=json_set(detail_json,'$.reason','[usunięto przez retencję]') WHERE entity_type='application' AND entity_id=? AND json_valid(detail_json) AND json_type(detail_json,'$.reason')='text'"
    );
    const redactRequest = db.prepare(
      "UPDATE requests SET fingerprint='[retencja]', response=json_set(response,'$.reason','[usunięto przez retencję]') WHERE key=? AND json_valid(response)"
    );
    for (const decision of decisions) {
      redactDecision.run(decision.id);
      redactDecisionAudit.run(decision.application_id);
      redactRequest.run(decision.idempotency_key);
    }
    const redactOutreach = db.prepare(
      "UPDATE outreach_tasks SET status=CASE WHEN status IN ('queued','leased') THEN 'cancelled' ELSE status END, payload_json='{}' WHERE application_id=?"
    );
    const redactAttempts = db.prepare(
      "UPDATE task_attempts SET message='[usunięto przez retencję]' WHERE outreach_task_id IN (SELECT id FROM outreach_tasks WHERE application_id=?)"
    );
    for (const id of candidates) {
      redactOutreach.run(id);
      redactAttempts.run(id);
    }
    db.prepare(
      `INSERT INTO audit_events (id,actor,action,entity_type,entity_id,detail_json,idempotency_key)
       VALUES (?,?,?,?,?,?,?)`
    ).run(
      randomUUID(),
      'system',
      'retention.completed',
      'retention',
      'daily',
      JSON.stringify({
        applications: candidates.length,
        cvFiles: files.length,
        outreachTasks,
        days,
      }),
      randomUUID()
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  await Promise.all(
    files.map(({ path }) =>
      unlink(path).catch((error) => {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      })
    )
  );
  return { applications: candidates.length, cvFiles: files.length, outreachTasks };
}

export function startRetentionSchedule(
  run,
  { intervalMs = 86400000, setTimer = setInterval, clearTimer = clearInterval } = {}
) {
  const timer = setTimer(() => void run(), intervalMs);
  timer.unref?.();
  return () => clearTimer(timer);
}
