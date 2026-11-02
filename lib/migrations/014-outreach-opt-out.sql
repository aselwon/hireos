CREATE TABLE outreach_opt_out_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  used_at TEXT
);
