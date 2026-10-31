CREATE TABLE job_briefs (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  stack_json TEXT NOT NULL CHECK (json_valid(stack_json)),
  seniority TEXT NOT NULL CHECK (seniority IN ('junior', 'mid', 'senior', 'lead')),
  salary_min INTEGER CHECK (salary_min >= 0),
  salary_max INTEGER CHECK (salary_max >= salary_min),
  currency TEXT NOT NULL DEFAULT 'PLN',
  salary_basis TEXT CHECK (salary_basis IN ('net', 'gross')),
  contract_type TEXT CHECK (contract_type IN ('b2b', 'employment')),
  location TEXT,
  remote INTEGER NOT NULL DEFAULT 0 CHECK (remote IN (0, 1)),
  advertisement TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'closed')),
  paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1)),
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE requirements (
  id TEXT PRIMARY KEY NOT NULL,
  job_brief_id TEXT NOT NULL REFERENCES job_briefs(id),
  description TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('must', 'nice')),
  weight INTEGER NOT NULL CHECK (weight IN (1, 2, 3))
);
CREATE INDEX requirements_job ON requirements(job_brief_id);
CREATE TABLE applications (
  id TEXT PRIMARY KEY NOT NULL,
  job_brief_id TEXT NOT NULL REFERENCES job_briefs(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'new',
  do_not_contact INTEGER NOT NULL DEFAULT 0 CHECK (do_not_contact IN (0, 1)),
  paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1)),
  human_takeover INTEGER NOT NULL DEFAULT 0 CHECK (human_takeover IN (0, 1)),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX applications_job ON applications(job_brief_id);
CREATE TABLE cv_files (
  id TEXT PRIMARY KEY NOT NULL,
  application_id TEXT NOT NULL REFERENCES applications(id),
  storage_path TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  extracted_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'extracted', 'needs_manual_review', 'failed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX cv_files_application ON cv_files(application_id);
CREATE TABLE cv_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  cv_file_id TEXT NOT NULL REFERENCES cv_files(id),
  profile_json TEXT NOT NULL CHECK (json_valid(profile_json)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'needs_manual_review', 'failed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX cv_profiles_file ON cv_profiles(cv_file_id);
CREATE TABLE profile_facts (
  id TEXT PRIMARY KEY NOT NULL,
  cv_profile_id TEXT NOT NULL REFERENCES cv_profiles(id),
  category TEXT NOT NULL CHECK (category IN ('skill', 'experience', 'education', 'language')),
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  quote TEXT NOT NULL,
  uncertain INTEGER NOT NULL DEFAULT 1 CHECK (uncertain IN (0, 1))
);
CREATE INDEX profile_facts_profile ON profile_facts(cv_profile_id);
CREATE TABLE screening_reports (
  id TEXT PRIMARY KEY NOT NULL,
  cv_profile_id TEXT NOT NULL REFERENCES cv_profiles(id),
  report_json TEXT NOT NULL CHECK (json_valid(report_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX screening_reports_profile ON screening_reports(cv_profile_id);
CREATE TABLE decisions (
  id TEXT PRIMARY KEY NOT NULL,
  application_id TEXT NOT NULL REFERENCES applications(id),
  screening_report_id TEXT REFERENCES screening_reports(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('approved', 'rejected')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  actor TEXT NOT NULL CHECK (length(trim(actor)) > 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX decisions_application ON decisions(application_id);
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE outreach_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  application_id TEXT NOT NULL REFERENCES applications(id),
  assigned_api_key_id TEXT REFERENCES api_keys(id),
  message_id TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'leased', 'sent', 'replied', 'needs_intervention', 'failed', 'unresolved', 'refused', 'cancelled')),
  lease_until TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX outreach_tasks_application ON outreach_tasks(application_id);
CREATE INDEX outreach_tasks_claim ON outreach_tasks(assigned_api_key_id, status, lease_until);
CREATE TABLE task_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  outreach_task_id TEXT NOT NULL REFERENCES outreach_tasks(id),
  api_key_id TEXT NOT NULL REFERENCES api_keys(id),
  result TEXT NOT NULL CHECK (result IN ('sent', 'replied', 'needs_intervention', 'failed', 'unresolved', 'verified_not_sent', 'verified_sent', 'refused')),
  message TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX task_attempts_task ON task_attempts(outreach_task_id);
CREATE TABLE model_calls (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('fake', 'cloudflare')),
  model TEXT NOT NULL,
  purpose TEXT NOT NULL,
  estimated_neurons INTEGER NOT NULL CHECK (estimated_neurons >= 0),
  actual_neurons INTEGER CHECK (actual_neurons >= 0),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'completed', 'failed', 'limit_exceeded')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX model_calls_daily_usage ON model_calls(created_at, provider);
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail_json TEXT NOT NULL CHECK (json_valid(detail_json)),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX audit_events_entity ON audit_events(entity_type, entity_id, created_at);
