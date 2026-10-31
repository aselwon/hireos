ALTER TABLE model_calls ADD COLUMN fingerprint TEXT;
ALTER TABLE model_calls ADD COLUMN input_tokens INTEGER CHECK (input_tokens >= 0);
ALTER TABLE model_calls ADD COLUMN output_tokens INTEGER CHECK (output_tokens >= 0);
ALTER TABLE model_calls ADD COLUMN response_json TEXT CHECK (json_valid(response_json));
ALTER TABLE model_calls ADD COLUMN finished_at TEXT;
CREATE TABLE model_gateway_blocks (
  provider TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (provider, day)
);
ALTER TABLE model_calls ADD COLUMN tokens_estimated INTEGER NOT NULL DEFAULT 1 CHECK (tokens_estimated IN (0, 1));
