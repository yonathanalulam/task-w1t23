CREATE TABLE IF NOT EXISTS journal_custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('TEXT', 'NUMBER', 'DATE', 'URL', 'BOOLEAN', 'SELECT')),
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  help_text TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (field_key ~ '^[a-z][a-z0-9_]{1,62}$')
);

CREATE TABLE IF NOT EXISTS journal_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  issn TEXT,
  publisher TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  custom_field_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_version_number INTEGER NOT NULL DEFAULT 0 CHECK (current_version_number >= 0),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_record_versions (
  id BIGSERIAL PRIMARY KEY,
  journal_id UUID NOT NULL REFERENCES journal_records(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  change_type TEXT NOT NULL CHECK (change_type IN ('CREATED', 'UPDATED', 'DELETED')),
  snapshot JSONB NOT NULL,
  changed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  change_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (journal_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_journal_records_active ON journal_records (is_deleted, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_record_versions_journal ON journal_record_versions (journal_id, version_number DESC);

CREATE TABLE IF NOT EXISTS journal_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id UUID NOT NULL REFERENCES journal_records(id) ON DELETE CASCADE,
  attachment_key TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('CONTRACT', 'QUOTE', 'SAMPLE_ISSUE', 'OTHER')),
  current_version_id UUID,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (journal_id, attachment_key)
);

CREATE TABLE IF NOT EXISTS journal_attachment_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id UUID NOT NULL REFERENCES journal_attachments(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  storage_type TEXT NOT NULL CHECK (storage_type IN ('FILE', 'LINK')),
  file_path TEXT,
  file_name TEXT,
  mime_type TEXT,
  size_bytes BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
  external_url TEXT,
  notes TEXT,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attachment_id, version_number),
  CHECK (
    (storage_type = 'FILE' AND file_path IS NOT NULL AND external_url IS NULL)
    OR (storage_type = 'LINK' AND external_url IS NOT NULL AND file_path IS NULL)
  )
);

ALTER TABLE journal_attachments
  DROP CONSTRAINT IF EXISTS fk_journal_attachments_current_version;

ALTER TABLE journal_attachments
  ADD CONSTRAINT fk_journal_attachments_current_version
  FOREIGN KEY (current_version_id)
  REFERENCES journal_attachment_versions(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_journal_attachments_journal ON journal_attachments (journal_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_journal_attachment_versions_attachment ON journal_attachment_versions (attachment_id, version_number DESC);

DROP TRIGGER IF EXISTS trg_no_update_delete_journal_record_versions ON journal_record_versions;
CREATE TRIGGER trg_no_update_delete_journal_record_versions
  BEFORE UPDATE OR DELETE ON journal_record_versions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_table_mutation();

DROP TRIGGER IF EXISTS trg_no_update_delete_journal_attachment_versions ON journal_attachment_versions;
CREATE TRIGGER trg_no_update_delete_journal_attachment_versions
  BEFORE UPDATE OR DELETE ON journal_attachment_versions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_table_mutation();
