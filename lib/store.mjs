import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { seed } from '../hireos/dist/seed.js';

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
export function openStore(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(
    'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS requests (key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, response TEXT NOT NULL)'
  );
  db.prepare('INSERT OR IGNORE INTO workspace VALUES (1, ?)').run(JSON.stringify(seed));
  const read = () =>
    JSON.parse(db.prepare('SELECT payload FROM workspace WHERE id=1').get().payload);
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
  return { read, mutate, close: () => db.close() };
}
