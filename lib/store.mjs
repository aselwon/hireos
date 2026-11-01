import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { seed } from '../hireos/dist/seed.js';

import { createAdvertisements } from './advertisements.mjs';
import { createCvFiles } from './cv-files.mjs';
import { createCvProfiles } from './cv-profiles.mjs';
import { createDecisions } from './decisions.mjs';
import { migrate } from './migrations.mjs';
import { createModelGateway } from './model-gateway.mjs';
import { createOutreach } from './outreach.mjs';
import { createScreening } from './screening.mjs';
import { technologies } from './technologies.mjs';

const stages = ['new', 'review', 'interview', 'decision'];
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
export function openStore(path = ':memory:', modelOptions) {
  const db = new DatabaseSync(path);
  let gateway;
  try {
    db.exec('PRAGMA journal_mode=WAL');
    migrate(db);
    gateway = createModelGateway(db, modelOptions);
    db.prepare('INSERT OR IGNORE INTO workspace VALUES (1, ?)').run(JSON.stringify(seed));
  } catch (error) {
    db.close();
    throw error;
  }
  const read = () =>
    JSON.parse(db.prepare('SELECT payload FROM workspace WHERE id=1').get().payload);
  function listBriefs() {
    return db
      .prepare('SELECT * FROM job_briefs ORDER BY created_at DESC, id')
      .all()
      .map((row) => ({
        ...row,
        stack: JSON.parse(row.stack_json),
        remote: Boolean(row.remote),
      }));
  }
  const advertisements = createAdvertisements(db, gateway);
  const cvFiles = createCvFiles(db);
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
    mutate,
    outreach: createOutreach(db),
    listBriefs,
    createBrief,
    ...advertisements,
    ...cvFiles,
    ...createCvProfiles(db, gateway),
    decide: createDecisions(db),
    ...createScreening(db, gateway),
    generate: gateway.generate,
    close: () => db.close(),
  };
}
