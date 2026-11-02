import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { seed } from '../hireos/dist/seed.js';

import { createAdvertisements } from './advertisements.mjs';
import { createClients } from './clients.mjs';
import { createCvFiles } from './cv-files.mjs';
import { createCvProfiles } from './cv-profiles.mjs';
import { createCvQueue } from './cv-queue.mjs';
import { createDataRights } from './data-rights.mjs';
import { createDecisions } from './decisions.mjs';
import { migrate } from './migrations.mjs';
import { createModelGateway } from './model-gateway.mjs';
import { createOutreach } from './outreach.mjs';
import { purgeRejectedCv } from './retention.mjs';
import { createScreening } from './screening.mjs';
import { technologies } from './technologies.mjs';

const stages = ['new', 'review', 'interview', 'decision'];
function retainAiLogs(db, options) {
  const days = Number(
    options?.env?.AI_LOG_RETENTION_DAYS ?? process.env.AI_LOG_RETENTION_DAYS ?? 180
  );
  if (!Number.isSafeInteger(days) || days < 1) {
    throw new Error('AI_LOG_RETENTION_DAYS musi być dodatnią liczbą całkowitą.');
  }
  const now = options?.now?.() ?? new Date();
  db.prepare('DELETE FROM model_calls WHERE created_at < ?').run(
    new Date(now.getTime() - days * 86400000).toISOString()
  );
}
function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}
function exportAiAudit(db) {
  const header =
    'application_id,prompt_version,model,purpose,created_at,estimated_neurons,actual_neurons,result_hash';
  const rows = db
    .prepare(
      'SELECT application_id, prompt_version, model, purpose, created_at, estimated_neurons, actual_neurons, result_hash FROM model_calls ORDER BY created_at, id'
    )
    .all();
  return [header, ...rows.map((row) => Object.values(row).map(csvCell).join(','))].join('\r\n');
}
function markAiReportViewed(db, applicationId, actor, now) {
  const report = db
    .prepare(
      'SELECT r.report_json FROM screening_reports r JOIN cv_profiles p ON p.id=r.cv_profile_id JOIN cv_files c ON c.id=p.cv_file_id WHERE c.application_id=? ORDER BY r.rowid DESC LIMIT 1'
    )
    .get(applicationId);
  if (!report) {
    throw Object.assign(new Error('Nie znaleziono raportu AI.'), { status: 404 });
  }
  db.prepare(
    'INSERT INTO ai_report_views (application_id, viewed_at, actor) VALUES (?, ?, ?) ON CONFLICT(application_id) DO UPDATE SET viewed_at=excluded.viewed_at, actor=excluded.actor'
  ).run(applicationId, now().toISOString(), actor);
  return JSON.parse(report.report_json);
}
function pauseAction(state, input, event) {
  if (typeof input.paused !== 'boolean') {
    throw new Error('Niepoprawny stan automatyzacji.');
  }
  state.paused = input.paused;
  event(
    input.paused ? 'Wstrzymano automatyzację' : 'Wznowiono automatyzację',
    'Zmiana dotyczy kolejki lokalnej.'
  );
}
function jobAction(state, input, event) {
  for (const field of ['title', 'company', 'location']) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > 160) {
      throw new Error('Uzupełnij stanowisko, firmę i lokalizację (maks. 160 znaków).');
    }
  }
  state.jobs.unshift({
    id: randomUUID(),
    title: input.title.trim(),
    company: input.company.trim(),
    location: input.location.trim(),
    salary: 'Do ustalenia',
    skills: [],
    status: 'draft',
  });
  event('Utworzono rekrutację', input.title.trim());
}
function stageAction(state, input, event) {
  const candidate = state.candidates.find((c) => c.id === input.id);
  if (!candidate || !stages.includes(input.stage)) {
    throw new Error('Niepoprawny kandydat lub etap.');
  }
  if (Math.abs(stages.indexOf(candidate.stage) - stages.indexOf(input.stage)) !== 1) {
    throw new Error('Dozwolona jest zmiana o jeden etap.');
  }
  if (typeof input.note !== 'string' || input.note.trim().length < 8 || input.note.length > 2000) {
    throw new Error('Podaj uzasadnienie zmiany (8–2000 znaków).');
  }
  const previous = candidate.stage;
  candidate.stage = input.stage;
  candidate.updated = new Date().toISOString();
  event('Zmieniono etap', `${candidate.name}: ${previous} → ${input.stage}. ${input.note.trim()}`);
}
function runAction(state, input, event) {
  if (state.paused) {
    throw new Error('Automatyzacja jest wstrzymana.');
  }
  const task = state.tasks.find((t) => t.id === input.id);
  if (!task || task.status !== 'queued') {
    throw new Error('Zadanie nie jest gotowe do uruchomienia.');
  }
  const candidate = state.candidates.find((c) => c.id === task.candidateId);
  if (!candidate?.consent) {
    throw new Error('Brak zgody demonstracyjnej na ten przepływ.');
  }
  const job = state.jobs.find((j) => j.id === candidate.jobId);
  task.output =
    task.type === 'interview_plan'
      ? `Plan rozmowy (szablon, bez wywołania AI): 5 min wprowadzenia; 20 min omówienia projektu; 20 min zadania z ${job.skills[0] || 'wymagań stanowiska'}; 10 min pytań kandydata; 5 min podsumowania. Kryteria: poprawność, testy, uzasadnienie wyborów. Bez oceny osobowości.`
      : `Checklista materiałów (reguły, bez wywołania AI): ${candidate.evidence.join('; ')}. Brak materiału nie oznacza braku kompetencji. Do weryfikacji przez rekrutera.`;
  task.status = 'completed';
  event(
    'Ukończono zadanie lokalne',
    `${task.agent}: ${task.title}. Nie wykonano działania w systemie zewnętrznym.`
  );
}
const actions = { pause: pauseAction, job: jobAction, stage: stageAction, run: runAction };
function listApplications(db, briefId) {
  return db
    .prepare(
      `SELECT a.id, a.job_brief_id AS briefId, a.name, a.email, a.stage,
      a.do_not_contact AS doNotContact, a.created_at AS createdAt, c.status AS cvStatus, p.status AS profileStatus,
      p.profile_json AS profileJson, r.report_json AS reportJson,
      q.status AS processingStatus, q.available_at AS processingAvailableAt
      FROM applications a
      LEFT JOIN cv_files c ON c.id=(SELECT id FROM cv_files WHERE application_id=a.id ORDER BY created_at DESC, id LIMIT 1)
      LEFT JOIN cv_processing_jobs q ON q.cv_file_id=c.id
      LEFT JOIN cv_profiles p ON p.cv_file_id=c.id
      LEFT JOIN screening_reports r ON r.cv_profile_id=p.id
      WHERE a.job_brief_id=? ORDER BY a.created_at DESC, a.id`
    )
    .all(briefId)
    .map((row) => ({
      ...row,
      profile: row.profileJson ? JSON.parse(row.profileJson) : null,
      report: row.reportJson ? JSON.parse(row.reportJson) : null,
      uncertain: row.profileJson
        ? Object.values(JSON.parse(row.profileJson))
            .flat()
            .some((fact) => fact.uncertain)
        : false,
    }));
}
function listBriefs(db) {
  return db
    .prepare('SELECT * FROM job_briefs ORDER BY created_at DESC, id')
    .all()
    .map((row) => ({
      ...row,
      stack: JSON.parse(row.stack_json),
      remote: Boolean(row.remote),
    }));
}
export function openStore(path = ':memory:', modelOptions, { seedDemo = true } = {}) {
  const db = new DatabaseSync(path);
  let gateway;
  try {
    db.exec('PRAGMA journal_mode=WAL');
    migrate(db);
    gateway = createModelGateway(db, modelOptions);
    if (seedDemo) {
      db.prepare('INSERT OR IGNORE INTO workspace VALUES (1, ?)').run(JSON.stringify(seed));
    }
  } catch (error) {
    db.close();
    throw error;
  }
  const read = () =>
    JSON.parse(db.prepare('SELECT payload FROM workspace WHERE id=1').get().payload);
  const advertisements = createAdvertisements(db, gateway);
  const cvFiles = createCvFiles(db);
  const profiles = createCvProfiles(db, gateway);
  const screening = createScreening(db, gateway);
  const queue = createCvQueue(db, profiles, screening, modelOptions?.now);
  try {
    retainAiLogs(db, modelOptions);
  } catch (error) {
    db.close();
    throw error;
  }
  function createBrief(input, key) {
    if (typeof key !== 'string' || !key || key.length > 128) {
      throw new Error('Wymagany poprawny Idempotency-Key.');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Podaj poprawne dane briefu.');
    }
    const { title, stack, seniority, salary, location, remote } = input;
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 160) {
      throw new Error('Stanowisko jest wymagane (maks. 160 znaków).');
    }
    if (
      !Array.isArray(stack) ||
      !stack.length ||
      stack.some((item) => !technologies.includes(item)) ||
      new Set(stack).size !== stack.length
    ) {
      throw new Error('Wybierz unikalne technologie ze słownika IT.');
    }
    if (!['junior', 'mid', 'senior', 'lead'].includes(seniority)) {
      throw new Error('Wybierz poprawny poziom seniority.');
    }
    if (
      !salary ||
      !Number.isSafeInteger(salary.min) ||
      !Number.isSafeInteger(salary.max) ||
      salary.min < 0 ||
      salary.max < salary.min ||
      !['PLN', 'EUR', 'USD'].includes(salary.currency) ||
      !['net', 'gross'].includes(salary.basis) ||
      !['b2b', 'employment'].includes(salary.contractType)
    ) {
      throw new Error('Podaj poprawne widełki, walutę, kwotę netto/brutto i formę umowy.');
    }
    if (
      typeof remote !== 'boolean' ||
      (!remote &&
        (typeof location !== 'string' || !location.trim() || location.trim().length > 160)) ||
      (location !== undefined && (typeof location !== 'string' || location.length > 160))
    ) {
      throw new Error('Podaj lokalizację lub zaznacz pracę zdalną.');
    }
    const fingerprint = JSON.stringify({ action: 'brief', input });
    db.exec('BEGIN IMMEDIATE');
    try {
      const cached = db.prepare('SELECT * FROM requests WHERE key=?').get(key);
      if (cached) {
        if (cached.fingerprint !== fingerprint) {
          throw new Error('Klucz idempotencji został już użyty dla innej operacji.');
        }
        db.exec('COMMIT');
        return JSON.parse(cached.response);
      }
      const brief = {
        id: randomUUID(),
        title: title.trim(),
        stack: [...stack],
        seniority,
        salaryMin: salary.min,
        salaryMax: salary.max,
        currency: salary.currency,
        salaryBasis: salary.basis,
        contractType: salary.contractType,
        location: location?.trim() || null,
        remote,
      };
      db.prepare(
        'INSERT INTO job_briefs (id,title,stack_json,seniority,salary_min,salary_max,currency,salary_basis,contract_type,location,remote) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
      ).run(
        brief.id,
        brief.title,
        JSON.stringify(brief.stack),
        brief.seniority,
        brief.salaryMin,
        brief.salaryMax,
        brief.currency,
        brief.salaryBasis,
        brief.contractType,
        brief.location,
        Number(brief.remote)
      );
      db.prepare('INSERT INTO requests VALUES (?,?,?)').run(
        key,
        fingerprint,
        JSON.stringify(brief)
      );
      db.exec('COMMIT');
      return brief;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function mutate(action, input, key) {
    if (!key || key.length > 128) {
      throw new Error('Wymagany poprawny Idempotency-Key.');
    }
    const fingerprint = JSON.stringify({ action, input });
    db.exec('BEGIN IMMEDIATE');
    try {
      const cached = db.prepare('SELECT * FROM requests WHERE key=?').get(key);
      if (cached) {
        if (cached.fingerprint !== fingerprint) {
          throw new Error('Klucz idempotencji został już użyty dla innej operacji.');
        }
        db.exec('COMMIT');
        return JSON.parse(cached.response);
      }
      const state = read();
      const event = (action, detail) =>
        state.events.unshift({
          id: randomUUID(),
          at: new Date().toISOString(),
          actor: 'Operator demo',
          action,
          detail,
        });
      const handler = actions[action];
      if (!Object.hasOwn(actions, action)) {
        throw new Error('Nieznana operacja.');
      }
      handler(state, input, event);
      db.prepare('UPDATE workspace SET payload=? WHERE id=1').run(JSON.stringify(state));
      db.prepare('INSERT INTO requests VALUES (?,?,?)').run(
        key,
        fingerprint,
        JSON.stringify(state)
      );
      db.exec('COMMIT');
      return state;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return {
    read,
    healthStatus: () => {
      db.prepare('SELECT 1').get();
      return {
        schemaVersion: db
          .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
          .get().version,
        aiCapReached: gateway.capReached(),
      };
    },
    mutate,
    outreach: createOutreach(db),
    dataRights: createDataRights(db),
    listBriefs: () => listBriefs(db),
    ...createClients(db),
    listApplications: (briefId) => listApplications(db, briefId),
    createBrief,
    ...advertisements,
    ...cvFiles,
    ...profiles,
    processCvQueue: queue.process,
    decide: createDecisions(db),
    markAiReportViewed: (applicationId, actor) =>
      markAiReportViewed(db, applicationId, actor, modelOptions?.now ?? (() => new Date())),
    exportAiAudit: () => exportAiAudit(db),
    ...screening,
    generate: gateway.generate,
    purgeRejectedCv: (options) => purgeRejectedCv(db, options),
    close: () => db.close(),
  };
}
