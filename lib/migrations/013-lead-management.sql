ALTER TABLE company_leads ADD COLUMN status TEXT NOT NULL DEFAULT 'new'
  CHECK (status IN ('new', 'contacted', 'offer', 'won', 'lost'));
ALTER TABLE company_leads ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE company_leads ADD COLUMN client_id TEXT REFERENCES clients(id);
CREATE TABLE lead_management_requests (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  fingerprint TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json))
);
CREATE INDEX company_leads_created ON company_leads(created_at);
