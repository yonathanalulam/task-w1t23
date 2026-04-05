CREATE TABLE IF NOT EXISTS finance_settlement_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_label TEXT NOT NULL,
  imported_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  row_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  exception_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  customer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('RESOURCE_BOOKING', 'JOURNAL_SERVICE', 'OTHER')),
  service_reference_id UUID,
  description TEXT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'CNY',
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount > 0),
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  refunded_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  has_open_exception BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL CHECK (status IN ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')),
  due_at TIMESTAMPTZ,
  issued_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (refunded_amount <= paid_amount)
);

CREATE INDEX IF NOT EXISTS idx_finance_invoices_status ON finance_invoices (status, has_open_exception, created_at DESC);

CREATE TABLE IF NOT EXISTS finance_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES finance_invoices(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('WECHAT_OFFLINE')),
  wechat_transaction_ref TEXT NOT NULL UNIQUE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  received_at TIMESTAMPTZ NOT NULL,
  settlement_status TEXT NOT NULL CHECK (settlement_status IN ('UNSETTLED', 'MATCHED', 'EXCEPTION')) DEFAULT 'UNSETTLED',
  settlement_import_id UUID REFERENCES finance_settlement_imports(id) ON DELETE SET NULL,
  recorded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_payments_invoice ON finance_payments (invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_payments_unsettled ON finance_payments (settlement_status, created_at DESC);

CREATE TABLE IF NOT EXISTS finance_settlement_rows (
  id BIGSERIAL PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES finance_settlement_imports(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  wechat_transaction_ref TEXT,
  amount NUMERIC(12,2),
  settled_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('MATCHED', 'UNMATCHED', 'AMOUNT_MISMATCH', 'DUPLICATE_REF', 'INVALID_ROW')),
  exception_reason TEXT,
  matched_payment_id UUID REFERENCES finance_payments(id) ON DELETE SET NULL,
  raw_row JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (import_id, row_number)
);

CREATE INDEX IF NOT EXISTS idx_finance_settlement_rows_status ON finance_settlement_rows (status, created_at DESC);

CREATE TABLE IF NOT EXISTS finance_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES finance_invoices(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES finance_payments(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  refund_method TEXT NOT NULL CHECK (refund_method IN ('WECHAT_OFFLINE', 'BANK_TRANSFER')),
  reason TEXT NOT NULL,
  wechat_refund_reference TEXT,
  bank_account_name TEXT,
  bank_routing_number_encrypted TEXT,
  bank_account_number_encrypted TEXT,
  bank_account_last4 TEXT,
  recorded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  refunded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (refund_method = 'WECHAT_OFFLINE' AND wechat_refund_reference IS NOT NULL)
    OR (refund_method = 'BANK_TRANSFER' AND bank_routing_number_encrypted IS NOT NULL AND bank_account_number_encrypted IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_finance_refunds_invoice ON finance_refunds (invoice_id, created_at DESC);

CREATE TABLE IF NOT EXISTS finance_ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  invoice_id UUID REFERENCES finance_invoices(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES finance_payments(id) ON DELETE SET NULL,
  refund_id UUID REFERENCES finance_refunds(id) ON DELETE SET NULL,
  settlement_row_id BIGINT REFERENCES finance_settlement_rows(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('INVOICE_ISSUED', 'PAYMENT_RECORDED', 'REFUND_RECORDED', 'SETTLEMENT_MATCHED', 'SETTLEMENT_EXCEPTION', 'SETTLEMENT_UNMATCHED')),
  amount NUMERIC(12,2),
  currency_code TEXT NOT NULL DEFAULT 'CNY',
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_ledger_invoice ON finance_ledger_entries (invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_ledger_actor ON finance_ledger_entries (actor_user_id, created_at DESC);
