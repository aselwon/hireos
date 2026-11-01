ALTER TABLE applications ADD COLUMN future_recruitment_consent INTEGER NOT NULL DEFAULT 0 CHECK (future_recruitment_consent IN (0, 1));
