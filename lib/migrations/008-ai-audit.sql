ALTER TABLE model_calls ADD COLUMN prompt_version TEXT NOT NULL DEFAULT '1';
ALTER TABLE model_calls ADD COLUMN result_hash TEXT;
ALTER TABLE decisions ADD COLUMN ai_report_seen INTEGER NOT NULL DEFAULT 0 CHECK (ai_report_seen IN (0, 1));
ALTER TABLE decisions ADD COLUMN agreed_with_ai INTEGER CHECK (agreed_with_ai IN (0, 1));
CREATE TABLE ai_report_views (
  application_id TEXT PRIMARY KEY NOT NULL REFERENCES applications(id),
  viewed_at TEXT NOT NULL,
  actor TEXT NOT NULL
);
