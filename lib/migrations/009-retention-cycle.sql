ALTER TABLE job_briefs ADD COLUMN closed_at TEXT;
UPDATE job_briefs
SET closed_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status='closed';
CREATE TRIGGER job_briefs_closed_at
AFTER UPDATE OF status ON job_briefs
WHEN NEW.status='closed' AND OLD.status<>'closed'
BEGIN
  UPDATE job_briefs SET closed_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=NEW.id;
END;
