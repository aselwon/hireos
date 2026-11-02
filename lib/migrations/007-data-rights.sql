CREATE TABLE data_requests (
  id TEXT PRIMARY KEY NOT NULL,
  application_id TEXT REFERENCES applications(id),
  kind TEXT NOT NULL CHECK (kind IN ('access', 'erase', 'object')),
  received_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL
);
CREATE INDEX data_requests_application ON data_requests(application_id);
ALTER TABLE model_calls ADD COLUMN application_id TEXT REFERENCES applications(id);
