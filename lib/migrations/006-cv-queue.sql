CREATE TABLE cv_processing_jobs (
  cv_file_id TEXT PRIMARY KEY REFERENCES cv_files(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'parse' CHECK (stage IN ('parse', 'screening')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'completed', 'needs_manual_review')),
  available_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0)
);
CREATE INDEX cv_processing_jobs_due ON cv_processing_jobs(status, available_at);
