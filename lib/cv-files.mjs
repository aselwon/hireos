export function createCvFiles(db) {
  return {
    getCvFile(applicationId) {
      return db
        .prepare('SELECT extracted_text, status FROM cv_files WHERE application_id=?')
        .get(applicationId);
    },
  };
}

export function insertCvFile(db, applicationId, cv) {
  db.prepare(
    'INSERT INTO cv_files (id, application_id, storage_path, original_name, sha256, size_bytes, extracted_text, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    cv.id,
    applicationId,
    cv.storagePath,
    cv.originalName,
    cv.sha256,
    cv.sizeBytes,
    cv.extractedText,
    cv.status
  );
}
