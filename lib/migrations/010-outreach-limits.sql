CREATE TABLE outreach_settings (
  id INTEGER PRIMARY KEY CHECK (id=1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);
INSERT INTO outreach_settings VALUES (1, '{"daily_global":0,"daily_per_recruitment":0,"recruitment_limits":{},"max_followups":0,"min_interval_seconds":86400,"start_hour":9,"end_hour":17}');
CREATE TABLE outreach_reservations (
  task_id TEXT PRIMARY KEY REFERENCES outreach_tasks(id) ON DELETE CASCADE,
  reserved_at TEXT NOT NULL,
  is_initial INTEGER NOT NULL CHECK (is_initial IN (0,1))
);
-- Istniejąca historia też zużywa limity; nie zakładamy, że niepewna próba nie wyszła.
INSERT INTO outreach_reservations
SELECT t.id, t.created_at,
  CASE WHEN ROW_NUMBER() OVER (PARTITION BY t.application_id ORDER BY t.created_at,t.id)=1 THEN 1 ELSE 0 END
FROM outreach_tasks t
WHERE t.status!='queued' OR EXISTS (SELECT 1 FROM task_attempts a WHERE a.outreach_task_id=t.id);
