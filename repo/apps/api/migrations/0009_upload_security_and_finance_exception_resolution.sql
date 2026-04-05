ALTER TABLE application_document_versions
  ADD COLUMN IF NOT EXISTS detected_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS security_scan_status TEXT NOT NULL DEFAULT 'CLEAN' CHECK (security_scan_status IN ('CLEAN', 'WARNING', 'HELD')),
  ADD COLUMN IF NOT EXISTS security_scan_findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_admin_review_required BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE journal_attachment_versions
  ADD COLUMN IF NOT EXISTS detected_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS security_scan_status TEXT NOT NULL DEFAULT 'CLEAN' CHECK (security_scan_status IN ('CLEAN', 'WARNING', 'HELD')),
  ADD COLUMN IF NOT EXISTS security_scan_findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_admin_review_required BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE finance_settlement_rows
  ADD COLUMN IF NOT EXISTS resolution_status TEXT NOT NULL DEFAULT 'OPEN' CHECK (resolution_status IN ('OPEN', 'RESOLVED', 'CLOSED')),
  ADD COLUMN IF NOT EXISTS resolution_note TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_finance_settlement_rows_resolution_status
  ON finance_settlement_rows (resolution_status, created_at DESC);

ALTER TABLE finance_ledger_entries
  DROP CONSTRAINT IF EXISTS finance_ledger_entries_entry_type_check;

ALTER TABLE finance_ledger_entries
  ADD CONSTRAINT finance_ledger_entries_entry_type_check
  CHECK (
    entry_type IN (
      'INVOICE_ISSUED',
      'PAYMENT_RECORDED',
      'REFUND_RECORDED',
      'SETTLEMENT_MATCHED',
      'SETTLEMENT_EXCEPTION',
      'SETTLEMENT_UNMATCHED',
      'SETTLEMENT_EXCEPTION_RESOLVED',
      'SETTLEMENT_EXCEPTION_CLOSED'
    )
  );
