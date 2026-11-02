CREATE TABLE outreach_live_settings (
  id INTEGER PRIMARY KEY CHECK (id=1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);
INSERT INTO outreach_live_settings VALUES (1, '{"outreach_live":false,"control_test":null}');
