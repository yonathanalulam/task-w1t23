ALTER TABLE applications
  DROP CONSTRAINT IF EXISTS applications_policy_id_applicant_user_id_key;

CREATE INDEX IF NOT EXISTS idx_applications_applicant_created_at
  ON applications (applicant_user_id, created_at DESC);
