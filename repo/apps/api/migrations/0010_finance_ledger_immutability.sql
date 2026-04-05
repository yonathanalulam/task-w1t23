CREATE OR REPLACE FUNCTION prevent_finance_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'finance_ledger_entries is append-only.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_no_update_delete_finance_ledger_entries ON finance_ledger_entries;
CREATE TRIGGER trg_no_update_delete_finance_ledger_entries
  BEFORE UPDATE OR DELETE ON finance_ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_finance_ledger_mutation();
