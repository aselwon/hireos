CREATE TABLE shortlists (
  id TEXT PRIMARY KEY NOT NULL,
  job_brief_id TEXT NOT NULL REFERENCES job_briefs(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  token_hash TEXT NOT NULL UNIQUE,
  fields_json TEXT NOT NULL CHECK (json_valid(fields_json)),
  candidate_count INTEGER NOT NULL CHECK (candidate_count > 0),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE shortlist_members (
  shortlist_id TEXT NOT NULL REFERENCES shortlists(id),
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  cv_file_id TEXT REFERENCES cv_files(id) ON DELETE SET NULL,
  PRIMARY KEY (shortlist_id, application_id)
);
CREATE INDEX shortlist_members_application ON shortlist_members(application_id);
CREATE TABLE shortlist_requests (
  key_hash TEXT PRIMARY KEY NOT NULL,
  fingerprint TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json))
);
