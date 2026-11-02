CREATE TABLE company_leads (
  id TEXT PRIMARY KEY NOT NULL,
  company TEXT NOT NULL,
  contact TEXT NOT NULL,
  position TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE lead_requests (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  fingerprint TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at TEXT NOT NULL
);
CREATE TABLE lead_rate_limits (
  address_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX lead_rate_limits_window ON lead_rate_limits(address_hash, created_at);
