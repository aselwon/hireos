import { createHash, randomUUID } from 'node:crypto';

import { insertCvFile } from './cv-files.mjs';

export function createAdvertisements(db, gateway) {
  function getBrief(id) {
    const row = db.prepare('SELECT * FROM job_briefs WHERE id=?').get(id);
    return row && { ...row, stack: JSON.parse(row.stack_json), remote: Boolean(row.remote) };
  }

  function listRequirements(id) {
    return db
      .prepare(
        'SELECT id, description, priority, weight FROM requirements WHERE job_brief_id=? ORDER BY rowid'
      )
      .all(id);
  }

  function requireKey(key) {
    if (typeof key !== 'string' || !key.trim() || key.length > 128) {
      throw new Error('Wymagany poprawny Idempotency-Key.');
    }
  }

  function validateContent(content) {
    if (
      !content ||
      typeof content.advertisement !== 'string' ||
      !content.advertisement.trim() ||
      !Array.isArray(content.requirements) ||
      !content.requirements.length ||
      content.requirements.length > 30 ||
      content.requirements.some(
        (item) =>
          !item ||
          typeof item.description !== 'string' ||
          !item.description.trim() ||
          item.description.length > 500 ||
          !['must', 'nice'].includes(item.priority) ||
          ![1, 2, 3].includes(item.weight)
      )
    ) {
      throw new Error('Model zwrócił niepoprawne ogłoszenie lub macierz wymagań.');
    }
    return { advertisement: content.advertisement.trim(), requirements: content.requirements };
  }

  async function generateBrief(id, key) {
    requireKey(key);
    const brief = getBrief(id);
    if (!brief) {
      throw new Error('Nie znaleziono rekrutacji.');
    }
    const prompt = `Zwróć wyłącznie JSON zgodny ze schematem {"advertisement": string, "requirements": [{"description": string, "priority": "must"|"nice", "weight": 1|2|3}]}. Pisz ogłoszenie po polsku, bez danych wymyślonych poza briefem.\nStanowisko: ${brief.title}\nStack: ${brief.stack.join(', ')}\nSeniority: ${brief.seniority}\nWidełki: ${brief.salaryMin}-${brief.salaryMax} ${brief.currency} ${brief.salaryBasis}, ${brief.contractType}\nLokalizacja: ${brief.remote ? 'zdalnie' : brief.location}`;
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const requestKey = createHash('sha256').update(`${key}:${attempt}`).digest('hex');
        const response = await gateway.generate(
          { prompt, maxTokens: 1200, purpose: 'job-advertisement' },
          requestKey
        );
        return validateContent(JSON.parse(response.text));
      } catch (error) {
        lastError = error;
        if (error.status) {
          throw error;
        }
      }
    }
    throw new Error(
      `Nie udało się wygenerować poprawnego ogłoszenia po ponowieniu: ${lastError.message}`
    );
  }

  function saveContent(id, input, key) {
    requireKey(key);
    const content = validateContent(input);
    db.exec('BEGIN IMMEDIATE');
    try {
      const brief = db.prepare('SELECT status FROM job_briefs WHERE id=?').get(id);
      if (!brief) {
        throw new Error('Nie znaleziono rekrutacji.');
      }
      if (brief.status === 'approved' || brief.status === 'closed') {
        throw new Error('Zatwierdzonej rekrutacji nie można edytować.');
      }
      db.prepare('UPDATE job_briefs SET advertisement=? WHERE id=?').run(content.advertisement, id);
      db.prepare('DELETE FROM requirements WHERE job_brief_id=?').run(id);
      const insert = db.prepare(
        'INSERT INTO requirements (id,job_brief_id,description,priority,weight) VALUES (?,?,?,?,?)'
      );
      for (const item of content.requirements) {
        insert.run(randomUUID(), id, item.description.trim(), item.priority, item.weight);
      }
      db.exec('COMMIT');
      return { ...content, requirements: listRequirements(id) };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function approveBrief(id, key) {
    requireKey(key);
    db.exec('BEGIN IMMEDIATE');
    try {
      const brief = db.prepare('SELECT advertisement FROM job_briefs WHERE id=?').get(id);
      if (!brief) {
        throw new Error('Nie znaleziono rekrutacji.');
      }
      if (
        !brief.advertisement ||
        !db.prepare('SELECT 1 FROM requirements WHERE job_brief_id=?').get(id)
      ) {
        throw new Error('Najpierw zapisz ogłoszenie i macierz wymagań.');
      }
      db.prepare("UPDATE job_briefs SET status='approved', approved_at=? WHERE id=?").run(
        new Date().toISOString(),
        id
      );
      db.exec('COMMIT');
      return getBrief(id);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function createApplication(id, input, key, cv) {
    requireKey(key);
    if (
      typeof input?.name !== 'string' ||
      !input.name.trim() ||
      typeof input.email !== 'string' ||
      !input.email.includes('@') ||
      typeof input.consentVersion !== 'string' ||
      !input.consentVersion.trim()
    ) {
      throw new Error('Podaj imię, poprawny e-mail i wymaganą zgodę.');
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      const existing = db
        .prepare(
          'SELECT id, job_brief_id, name, email, consent_version FROM applications WHERE idempotency_key=?'
        )
        .get(key);
      if (existing) {
        if (
          existing.job_brief_id !== id ||
          existing.name !== input.name.trim() ||
          existing.email !== input.email.trim() ||
          existing.consent_version !== input.consentVersion
        ) {
          throw new Error('Klucz idempotencji został już użyty dla innej aplikacji.');
        }
        const file = db
          .prepare('SELECT original_name, sha256, size_bytes FROM cv_files WHERE application_id=?')
          .get(existing.id);
        if (
          !file ||
          file.sha256 !== cv.sha256 ||
          file.size_bytes !== cv.sizeBytes ||
          file.original_name !== cv.originalName
        ) {
          throw new Error('Klucz idempotencji został już użyty dla innego pliku CV.');
        }
        db.exec('COMMIT');
        return { application: { id: existing.id }, created: false };
      }
      const brief = db.prepare('SELECT status FROM job_briefs WHERE id=?').get(id);
      if (!brief || brief.status !== 'approved') {
        throw Object.assign(new Error('Rekrutacja nie przyjmuje aplikacji.'), { status: 409 });
      }
      const application = { id: randomUUID() };
      db.prepare(
        'INSERT INTO applications (id,job_brief_id,name,email,consent_version,consent_at,idempotency_key) VALUES (?,?,?,?,?,?,?)'
      ).run(
        application.id,
        id,
        input.name.trim(),
        input.email.trim(),
        input.consentVersion,
        new Date().toISOString(),
        key
      );
      insertCvFile(db, application.id, cv);
      db.exec('COMMIT');
      return { application, created: true };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    getBrief,
    listRequirements,
    generateBrief,
    saveContent,
    approveBrief,
    createApplication,
  };
}
