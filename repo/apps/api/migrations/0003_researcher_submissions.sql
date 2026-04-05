CREATE TABLE IF NOT EXISTS funding_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  submission_deadline_at TIMESTAMPTZ NOT NULL,
  grace_hours INTEGER NOT NULL DEFAULT 24,
  annual_cap_amount NUMERIC(12,2) NOT NULL CHECK (annual_cap_amount >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  CHECK (grace_hours >= 0)
);

CREATE TABLE IF NOT EXISTS policy_required_document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES funding_policies(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  label TEXT NOT NULL,
  instructions TEXT,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (policy_id, template_key)
);

CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES funding_policies(id) ON DELETE RESTRICT,
  applicant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  summary TEXT,
  requested_amount NUMERIC(12,2) NOT NULL CHECK (requested_amount >= 0),
  status TEXT NOT NULL,
  submitted_at TIMESTAMPTZ,
  last_status_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (policy_id, applicant_user_id)
);

CREATE INDEX IF NOT EXISTS idx_applications_applicant_status ON applications (applicant_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS application_status_history (
  id BIGSERIAL PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  previous_status TEXT,
  next_status TEXT NOT NULL,
  changed_by_user_id UUID REFERENCES users(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS application_validations (
  id BIGSERIAL PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  validation_type TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS application_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  granted_by_user_id UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  extended_until TIMESTAMPTZ NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS application_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  document_key TEXT NOT NULL,
  label TEXT NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  latest_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (application_id, document_key)
);

CREATE TABLE IF NOT EXISTS application_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES application_documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  storage_type TEXT NOT NULL,
  file_path TEXT,
  file_name TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  external_url TEXT,
  is_previewable BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version_number),
  CHECK (
    (storage_type = 'FILE' AND file_path IS NOT NULL AND external_url IS NULL)
    OR (storage_type = 'LINK' AND external_url IS NOT NULL AND file_path IS NULL)
  )
);

ALTER TABLE application_documents
  DROP CONSTRAINT IF EXISTS fk_application_documents_latest_version;

ALTER TABLE application_documents
  ADD CONSTRAINT fk_application_documents_latest_version
  FOREIGN KEY (latest_version_id)
  REFERENCES application_document_versions(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS document_rollbacks (
  id BIGSERIAL PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES application_documents(id) ON DELETE CASCADE,
  target_version_id UUID NOT NULL REFERENCES application_document_versions(id) ON DELETE CASCADE,
  rolled_back_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
