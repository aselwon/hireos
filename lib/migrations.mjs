import { readFileSync } from 'node:fs';

const migrations = [
  '001-demo.sql',
  '002-mvp.sql',
  '003-model-gateway.sql',
  '004-outreach-lease.sql',
  '005-application-consents.sql',
  '006-cv-queue.sql',
  '007-data-rights.sql',
  '008-ai-audit.sql',
  '009-retention-cycle.sql',
  '010-outreach-limits.sql',
  '011-clients.sql',
  '012-billing.sql',
];

export function migrate(db) {
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`);
    const applied = db
      .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
      .all();
    for (const [index, row] of applied.entries()) {
      if (row.version !== index + 1 || migrations[index] !== row.name) {
        throw new Error('Nieobsługiwana historia migracji bazy danych.');
      }
    }
    for (let index = applied.length; index < migrations.length; index += 1) {
      const name = migrations[index];
      db.exec(readFileSync(new URL(`./migrations/${name}`, import.meta.url), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
        index + 1,
        name
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
