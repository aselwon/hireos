import { randomUUID } from 'node:crypto';

export function createDecisions(db) {
  return function decide(applicationId, input, key, actor) {
    if (typeof key !== 'string' || !key.trim() || key.length > 128) {
      throw Object.assign(new Error('Wymagany poprawny Idempotency-Key.'), { status: 400 });
    }
    if (
      !input ||
      !['approved', 'rejected'].includes(input.outcome) ||
      typeof input.reason !== 'string' ||
      !input.reason.trim() ||
      input.reason.length > 2000
    ) {
      throw Object.assign(new Error('Podaj decyzję i uzasadnienie (maks. 2000 znaków).'), {
        status: 400,
      });
    }
    if (typeof actor !== 'string' || !actor.trim()) {
      throw Object.assign(new Error('Brak tożsamości rekrutera.'), { status: 401 });
    }
    const fingerprint = JSON.stringify({ action: 'decision', applicationId, input, actor });
    db.exec('BEGIN IMMEDIATE');
    try {
      const cached = db.prepare('SELECT * FROM requests WHERE key=?').get(key);
      if (cached) {
        if (cached.fingerprint !== fingerprint) {
          throw Object.assign(new Error('Klucz idempotencji użyty dla innego żądania.'), {
            status: 409,
          });
        }
        db.exec('COMMIT');
        return JSON.parse(cached.response);
      }
      const application = db
        .prepare('SELECT id, stage FROM applications WHERE id=?')
        .get(applicationId);
      if (!application) {
        throw Object.assign(new Error('Nie znaleziono aplikacji.'), { status: 404 });
      }
      const decision = {
        id: randomUUID(),
        applicationId,
        outcome: input.outcome,
        reason: input.reason.trim(),
        actor,
      };
      const viewed = db
        .prepare('SELECT 1 FROM ai_report_views WHERE application_id=?')
        .get(applicationId);
      if (input.agreedWithAi !== undefined && typeof input.agreedWithAi !== 'boolean') {
        throw Object.assign(new Error('Ocena zgodności z raportem musi być wartością logiczną.'), {
          status: 400,
        });
      }
      db.prepare(
        'INSERT INTO decisions (id, application_id, outcome, reason, actor, idempotency_key, ai_report_seen, agreed_with_ai) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        decision.id,
        applicationId,
        decision.outcome,
        decision.reason,
        actor,
        key,
        viewed ? 1 : 0,
        input.agreedWithAi === undefined ? null : Number(input.agreedWithAi)
      );
      decision.aiReportSeen = Boolean(viewed);
      decision.agreedWithAi = input.agreedWithAi ?? null;
      db.prepare('UPDATE applications SET stage=? WHERE id=?').run(input.outcome, applicationId);
      db.prepare(
        'INSERT INTO audit_events (id, actor, action, entity_type, entity_id, detail_json, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        randomUUID(),
        actor,
        `application.${input.outcome}`,
        'application',
        applicationId,
        JSON.stringify({
          decisionId: decision.id,
          reason: decision.reason,
          previousStage: application.stage,
        }),
        key
      );
      db.prepare('INSERT INTO requests VALUES (?, ?, ?)').run(
        key,
        fingerprint,
        JSON.stringify(decision)
      );
      db.exec('COMMIT');
      return decision;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
}
