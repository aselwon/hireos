import { createHash, randomBytes, randomUUID } from 'node:crypto';

const hash = (token) => createHash('sha256').update(token).digest('hex');
const missing = () => Object.assign(new Error('Nie znaleziono shortlisty.'), { status: 404 });
const allowedFields = ['name', 'email'];

export function createShortlists(db, now = () => new Date()) {
  function transaction(apply) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = apply();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function audit(id, action, actor, detail = {}) {
    db.prepare(
      'INSERT INTO audit_events (id,actor,action,entity_type,entity_id,detail_json,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?,?)'
    ).run(
      randomUUID(),
      actor,
      action,
      'shortlist',
      id,
      JSON.stringify(detail),
      randomUUID(),
      now().toISOString()
    );
  }
  function mutation(action, input, key, actor, apply) {
    if (typeof key !== 'string' || !key.trim() || key.length > 128) {
      throw new Error('Wymagany poprawny Idempotency-Key.');
    }
    return transaction(() => {
      const fingerprint = hash(JSON.stringify({ action, input, actor }));
      const cached = db.prepare('SELECT * FROM shortlist_requests WHERE key_hash=?').get(hash(key));
      if (cached) {
        if (cached.fingerprint !== fingerprint) {
          throw new Error('Klucz idempotencji został już użyty dla innej operacji.');
        }
        return JSON.parse(cached.response_json);
      }
      const result = apply();
      db.prepare('INSERT INTO shortlist_requests VALUES (?,?,?)').run(
        hash(key),
        fingerprint,
        JSON.stringify(result)
      );
      return result;
    });
  }
  function candidates(shortlist) {
    return db
      .prepare(
        `SELECT a.*, m.cv_file_id FROM shortlist_members m
      JOIN applications a ON a.id=m.application_id WHERE m.shortlist_id=? ORDER BY a.id`
      )
      .all(shortlist.id);
  }
  function eligible(application, briefId) {
    return (
      application?.job_brief_id === briefId &&
      application.consent_version === 'v3' &&
      Boolean(application.consent_at) &&
      !application.do_not_contact
    );
  }
  function create(input, key, actor) {
    return mutation('shortlist:create', input, key, actor, () => {
      const fields = input?.fields ?? ['name'];
      const ids = input?.applicationIds;
      const cvIds = input?.cvApplicationIds ?? [];
      const expiry = new Date(input?.expiresAt);
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        ids.length > 100 ||
        ids.some((id) => typeof id !== 'string') ||
        new Set(ids).size !== ids.length ||
        !Array.isArray(fields) ||
        !fields.length ||
        fields.some((field) => !allowedFields.includes(field)) ||
        !Array.isArray(cvIds) ||
        cvIds.some((id) => !ids.includes(id)) ||
        !Number.isFinite(expiry.getTime()) ||
        expiry <= now() ||
        expiry - now() > 30 * 86400000
      ) {
        throw new Error('Wybierz kandydatów, pola name/email i termin ważności do 30 dni.');
      }
      const brief = db.prepare('SELECT * FROM job_briefs WHERE id=?').get(input.briefId);
      if (!brief?.client_id) {
        throw new Error('Rekrutacja musi mieć przypisanego klienta.');
      }
      const members = ids.map((id) => {
        const application = db.prepare('SELECT * FROM applications WHERE id=?').get(id);
        if (!eligible(application, brief.id)) {
          throw new Error('Kandydat musi należeć do rekrutacji, mieć zgodę v3 i brak sprzeciwu.');
        }
        const cv = cvIds.includes(id)
          ? db
              .prepare(
                'SELECT id FROM cv_files WHERE application_id=? ORDER BY created_at DESC, id LIMIT 1'
              )
              .get(id)
          : null;
        if (cvIds.includes(id) && !cv) {
          throw new Error('Brak CV do dołączenia.');
        }
        return { id, cvId: cv?.id ?? null };
      });
      const id = randomUUID();
      const token = randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO shortlists VALUES (?,?,?,?,?,?,?,NULL,?)').run(
        id,
        brief.id,
        brief.client_id,
        hash(token),
        JSON.stringify([...new Set(fields)]),
        ids.length,
        expiry.toISOString(),
        now().toISOString()
      );
      for (const member of members) {
        db.prepare('INSERT INTO shortlist_members VALUES (?,?,?)').run(id, member.id, member.cvId);
      }
      audit(id, 'shortlist.created', actor);
      return { id, path: `/s/${token}`, expiresAt: expiry.toISOString() };
    });
  }
  function open(token, cvId) {
    const result = transaction(() => {
      const shortlist = db.prepare('SELECT * FROM shortlists WHERE token_hash=?').get(hash(token));
      const members = shortlist ? candidates(shortlist) : [];
      const brief =
        shortlist &&
        db.prepare('SELECT client_id,title FROM job_briefs WHERE id=?').get(shortlist.job_brief_id);
      const valid =
        shortlist &&
        !shortlist.revoked_at &&
        shortlist.expires_at > now().toISOString() &&
        brief.client_id === shortlist.client_id &&
        members.length === shortlist.candidate_count &&
        members.every((member) => eligible(member, shortlist.job_brief_id));
      const cv =
        valid && cvId && members.some((member) => member.cv_file_id === cvId)
          ? db.prepare('SELECT storage_path FROM cv_files WHERE id=?').get(cvId)
          : null;
      const granted = Boolean(valid && (!cvId || cv));
      audit(shortlist?.id ?? 'unknown', 'shortlist.opened', 'public-link', {
        granted,
        resource: cvId ? 'cv' : 'list',
      });
      if (!granted) {
        return null;
      }
      if (cv) {
        return { storagePath: cv.storage_path };
      }
      const fields = JSON.parse(shortlist.fields_json);
      return {
        title: brief.title,
        candidates: members.map((member) => ({
          ...Object.fromEntries(fields.map((field) => [field, member[field]])),
          ...(member.cv_file_id ? { cvPath: `/s/${token}/cv/${member.cv_file_id}` } : {}),
        })),
      };
    });
    if (!result) {
      throw missing();
    }
    return result;
  }
  return {
    create,
    open,
    list: (briefId) =>
      db
        .prepare(
          'SELECT id,expires_at,revoked_at,created_at,candidate_count FROM shortlists WHERE job_brief_id=? ORDER BY created_at DESC'
        )
        .all(briefId),
    revoke(id, key, actor) {
      return mutation('shortlist:revoke', { id }, key, actor, () => {
        if (!db.prepare('SELECT id FROM shortlists WHERE id=?').get(id)) {
          throw missing();
        }
        db.prepare('UPDATE shortlists SET revoked_at=COALESCE(revoked_at,?) WHERE id=?').run(
          now().toISOString(),
          id
        );
        audit(id, 'shortlist.revoked', actor);
        return { id, revoked: true };
      });
    },
  };
}
