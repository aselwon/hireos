CREATE TABLE billing_events (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  brief_id TEXT NOT NULL REFERENCES job_briefs(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('advance', 'placement')),
  occurred_on TEXT NOT NULL,
  salary_grosz INTEGER,
  amount_grosz INTEGER NOT NULL CHECK (amount_grosz >= 0),
  status TEXT NOT NULL DEFAULT 'to_invoice' CHECK (status IN ('to_invoice', 'invoiced', 'paid')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((event_type = 'placement' AND salary_grosz > 0) OR (event_type = 'advance' AND salary_grosz IS NULL))
);
CREATE INDEX billing_events_export ON billing_events(status, occurred_on, id);
CREATE UNIQUE INDEX billing_events_one_advance ON billing_events(brief_id) WHERE event_type = 'advance';
