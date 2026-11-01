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
  const files = db
    .prepare(
      `SELECT c.id, c.storage_path AS path FROM cv_files c
    JOIN applications a ON a.id=c.application_id
    WHERE a.stage='rejected' AND EXISTS (
      SELECT 1 FROM decisions d WHERE d.application_id=a.id AND d.outcome='rejected'
        AND d.created_at<=? AND d.created_at=(SELECT MAX(latest.created_at) FROM decisions latest
          WHERE latest.application_id=a.id))`
    )
    .all(cutoff);
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
  return files.length;
}
