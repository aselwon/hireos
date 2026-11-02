// Jeden worker w procesie. Stan pozostaje queued podczas wywołania modelu:
// po restarcie trwałe klucze idempotencji odzyskują zapisane wyniki etapów.
export function createCvQueue(db, profiles, screening, now = () => new Date()) {
  let running = false;
  async function process() {
    if (running) {
      return;
    }
    running = true;
    try {
      const jobs = db
        .prepare(
          `SELECT q.*, c.application_id FROM cv_processing_jobs q
           JOIN cv_files c ON c.id=q.cv_file_id
           WHERE q.status='queued' AND q.available_at<=? ORDER BY q.available_at, q.rowid LIMIT 20`
        )
        .all(now().toISOString());
      for (const job of jobs) {
        const key = () => `cv-queue:${job.cv_file_id}:${job.stage}:${job.attempt}`;
        try {
          if (job.stage === 'parse') {
            await profiles.parseCv(job.application_id, key());
            db.prepare(
              "UPDATE cv_processing_jobs SET stage='screening', attempt=0 WHERE cv_file_id=?"
            ).run(job.cv_file_id);
            job.stage = 'screening';
            job.attempt = 0;
          }
          await screening.generateScreening(job.application_id, key());
          db.prepare("UPDATE cv_processing_jobs SET status='completed' WHERE cv_file_id=?").run(
            job.cv_file_id
          );
        } catch (error) {
          if (error.status === 503) {
            const nextDay = new Date(now());
            nextDay.setUTCHours(24, 0, 0, 0);
            // Nowy klucz dopiero następnego dnia: także niejednoznaczna próba
            // dostawcy nie blokuje zadania na zawsze i nie omija limitu doby.
            db.prepare(
              'UPDATE cv_processing_jobs SET available_at=?, attempt=attempt+1 WHERE cv_file_id=?'
            ).run(nextDay.toISOString(), job.cv_file_id);
          } else {
            db.prepare(
              "UPDATE cv_processing_jobs SET status='needs_manual_review' WHERE cv_file_id=?"
            ).run(job.cv_file_id);
          }
        }
      }
    } finally {
      running = false;
    }
  }
  return { process };
}

export function startCvWorker(store, onError, intervalMs = 1000) {
  let pending;
  const tick = () => {
    if (!pending) {
      pending = store
        .processCvQueue()
        .catch(onError)
        .finally(() => {
          pending = undefined;
        });
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return async () => {
    clearInterval(timer);
    await pending;
  };
}
