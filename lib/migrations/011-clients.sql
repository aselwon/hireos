CREATE TABLE clients (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  nip TEXT NOT NULL CHECK (length(nip) = 10 AND nip NOT GLOB '*[^0-9]*'),
  contact TEXT NOT NULL CHECK (length(trim(contact)) BETWEEN 1 AND 1000),
  billing_model TEXT NOT NULL CHECK (billing_model IN ('success_fee', 'fixed_fee')),
  fee_value INTEGER NOT NULL CHECK (fee_value >= 0 AND (billing_model != 'success_fee' OR fee_value <= 10000)),
  advance_grosz INTEGER NOT NULL CHECK (advance_grosz >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
ALTER TABLE job_briefs ADD COLUMN client_id TEXT REFERENCES clients(id);
CREATE INDEX job_briefs_client ON job_briefs(client_id);
