import type { Pool, PoolClient } from 'pg';
import type {
  FinanceInvoiceRecord,
  FinanceLedgerEntryRecord,
  FinancePaymentRecord,
  FinanceRefundRecord,
  FinanceSettlementExceptionRecord,
  FinanceSettlementImportRecord,
  FinanceSettlementRowRecord,
  InvoiceStatus,
  LedgerEntryType,
  PaymentMethod,
  RefundMethod,
  SettlementExceptionResolutionStatus,
  SettlementStatus,
  SettlementRowStatus
} from './types.js';

const toDate = (value: unknown): Date => (value instanceof Date ? value : new Date(String(value)));

const parseJsonObject = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  try {
    const parsed = JSON.parse(String(value));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
};

const mapInvoice = (row: Record<string, unknown>): FinanceInvoiceRecord => ({
  id: String(row.id),
  invoiceNumber: String(row.invoice_number),
  customerUserId: row.customer_user_id ? String(row.customer_user_id) : null,
  serviceType: String(row.service_type) as FinanceInvoiceRecord['serviceType'],
  serviceReferenceId: row.service_reference_id ? String(row.service_reference_id) : null,
  description: String(row.description),
  currencyCode: String(row.currency_code),
  totalAmount: String(row.total_amount),
  paidAmount: String(row.paid_amount),
  refundedAmount: String(row.refunded_amount),
  hasOpenException: Boolean(row.has_open_exception),
  status: String(row.status) as InvoiceStatus,
  dueAt: row.due_at ? toDate(row.due_at) : null,
  issuedByUserId: String(row.issued_by_user_id),
  issuedAt: toDate(row.issued_at),
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at)
});

const mapPayment = (row: Record<string, unknown>): FinancePaymentRecord => ({
  id: String(row.id),
  invoiceId: String(row.invoice_id),
  paymentMethod: String(row.payment_method) as PaymentMethod,
  wechatTransactionRef: String(row.wechat_transaction_ref),
  amount: String(row.amount),
  receivedAt: toDate(row.received_at),
  settlementStatus: String(row.settlement_status) as SettlementStatus,
  settlementImportId: row.settlement_import_id ? String(row.settlement_import_id) : null,
  recordedByUserId: String(row.recorded_by_user_id),
  note: row.note ? String(row.note) : null,
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at)
});

const mapRefund = (row: Record<string, unknown>): FinanceRefundRecord => ({
  id: String(row.id),
  invoiceId: String(row.invoice_id),
  paymentId: row.payment_id ? String(row.payment_id) : null,
  amount: String(row.amount),
  refundMethod: String(row.refund_method) as RefundMethod,
  reason: String(row.reason),
  wechatRefundReference: row.wechat_refund_reference ? String(row.wechat_refund_reference) : null,
  bankAccountName: row.bank_account_name ? String(row.bank_account_name) : null,
  bankRoutingNumberEncrypted: row.bank_routing_number_encrypted ? String(row.bank_routing_number_encrypted) : null,
  bankAccountNumberEncrypted: row.bank_account_number_encrypted ? String(row.bank_account_number_encrypted) : null,
  bankAccountLast4: row.bank_account_last4 ? String(row.bank_account_last4) : null,
  recordedByUserId: String(row.recorded_by_user_id),
  refundedAt: toDate(row.refunded_at),
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at)
});

const mapSettlementImport = (row: Record<string, unknown>): FinanceSettlementImportRecord => ({
  id: String(row.id),
  sourceLabel: String(row.source_label),
  importedByUserId: String(row.imported_by_user_id),
  rowCount: Number(row.row_count),
  matchedCount: Number(row.matched_count),
  exceptionCount: Number(row.exception_count),
  createdAt: toDate(row.created_at)
});

const mapSettlementRow = (row: Record<string, unknown>): FinanceSettlementRowRecord => ({
  id: Number(row.id),
  importId: String(row.import_id),
  rowNumber: Number(row.row_number),
  wechatTransactionRef: row.wechat_transaction_ref ? String(row.wechat_transaction_ref) : null,
  amount: row.amount ? String(row.amount) : null,
  settledAt: row.settled_at ? toDate(row.settled_at) : null,
  status: String(row.status) as SettlementRowStatus,
  exceptionReason: row.exception_reason ? String(row.exception_reason) : null,
  resolutionStatus: String(row.resolution_status ?? 'OPEN') as SettlementExceptionResolutionStatus,
  resolutionNote: row.resolution_note ? String(row.resolution_note) : null,
  resolvedByUserId: row.resolved_by_user_id ? String(row.resolved_by_user_id) : null,
  resolvedAt: row.resolved_at ? toDate(row.resolved_at) : null,
  matchedPaymentId: row.matched_payment_id ? String(row.matched_payment_id) : null,
  rawRow: parseJsonObject(row.raw_row),
  createdAt: toDate(row.created_at)
});

const mapLedger = (row: Record<string, unknown>): FinanceLedgerEntryRecord => ({
  id: Number(row.id),
  invoiceId: row.invoice_id ? String(row.invoice_id) : null,
  paymentId: row.payment_id ? String(row.payment_id) : null,
  refundId: row.refund_id ? String(row.refund_id) : null,
  settlementRowId: row.settlement_row_id ? Number(row.settlement_row_id) : null,
  entryType: String(row.entry_type) as LedgerEntryType,
  amount: row.amount ? String(row.amount) : null,
  currencyCode: String(row.currency_code),
  actorUserId: String(row.actor_user_id),
  actorUsername: row.actor_username ? String(row.actor_username) : null,
  details: parseJsonObject(row.details),
  createdAt: toDate(row.created_at)
});

const withTransaction = async <T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const createFinanceRepository = (pool: Pool) => {
  return {
    async withTransaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
      return withTransaction(pool, action);
    },

    async listInvoices(filters: { statuses?: InvoiceStatus[]; hasOpenException?: boolean } = {}): Promise<FinanceInvoiceRecord[]> {
      const clauses: string[] = [];
      const params: unknown[] = [];

      if (filters.statuses && filters.statuses.length > 0) {
        params.push(filters.statuses);
        clauses.push(`status = ANY($${params.length}::text[])`);
      }

      if (filters.hasOpenException !== undefined) {
        params.push(filters.hasOpenException);
        clauses.push(`has_open_exception = $${params.length}`);
      }

      const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT *
        FROM finance_invoices
        ${whereClause}
        ORDER BY created_at DESC
        `,
        params
      );

      return result.rows.map(mapInvoice);
    },

    async getInvoiceById(invoiceId: string): Promise<FinanceInvoiceRecord | null> {
      const result = await pool.query<Record<string, unknown>>('SELECT * FROM finance_invoices WHERE id = $1', [invoiceId]);
      const row = result.rows[0];
      return row ? mapInvoice(row) : null;
    },

    async getInvoiceByIdForUpdate(client: PoolClient, invoiceId: string): Promise<FinanceInvoiceRecord | null> {
      const result = await client.query<Record<string, unknown>>('SELECT * FROM finance_invoices WHERE id = $1 FOR UPDATE', [invoiceId]);
      const row = result.rows[0];
      return row ? mapInvoice(row) : null;
    },

    async createInvoice(input: {
      invoiceNumber: string;
      customerUserId?: string;
      serviceType: FinanceInvoiceRecord['serviceType'];
      serviceReferenceId?: string;
      description: string;
      currencyCode: string;
      totalAmount: string;
      status: InvoiceStatus;
      dueAt?: Date;
      issuedByUserId: string;
    }): Promise<FinanceInvoiceRecord> {
      const result = await pool.query<Record<string, unknown>>(
        `
        INSERT INTO finance_invoices (
          invoice_number,
          customer_user_id,
          service_type,
          service_reference_id,
          description,
          currency_code,
          total_amount,
          status,
          due_at,
          issued_by_user_id,
          issued_at,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW(),NOW())
        RETURNING *
        `,
        [
          input.invoiceNumber,
          input.customerUserId ?? null,
          input.serviceType,
          input.serviceReferenceId ?? null,
          input.description,
          input.currencyCode,
          input.totalAmount,
          input.status,
          input.dueAt ?? null,
          input.issuedByUserId
        ]
      );

      return mapInvoice(result.rows[0] as Record<string, unknown>);
    },

    async updateInvoiceFinancials(input: {
      invoiceId: string;
      paidAmount: string;
      refundedAmount: string;
      status: InvoiceStatus;
    }): Promise<FinanceInvoiceRecord> {
      const result = await pool.query<Record<string, unknown>>(
        `
        UPDATE finance_invoices
        SET paid_amount = $2,
            refunded_amount = $3,
            status = $4,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [input.invoiceId, input.paidAmount, input.refundedAmount, input.status]
      );

      return mapInvoice(result.rows[0] as Record<string, unknown>);
    },

    async updateInvoiceFinancialsInTransaction(client: PoolClient, input: {
      invoiceId: string;
      paidAmount: string;
      refundedAmount: string;
      status: InvoiceStatus;
    }): Promise<FinanceInvoiceRecord> {
      const result = await client.query<Record<string, unknown>>(
        `
        UPDATE finance_invoices
        SET paid_amount = $2,
            refunded_amount = $3,
            status = $4,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [input.invoiceId, input.paidAmount, input.refundedAmount, input.status]
      );

      return mapInvoice(result.rows[0] as Record<string, unknown>);
    },

    async setInvoiceExceptionFlag(invoiceId: string, hasOpenException: boolean): Promise<void> {
      await pool.query('UPDATE finance_invoices SET has_open_exception = $2, updated_at = NOW() WHERE id = $1', [invoiceId, hasOpenException]);
    },

    async createPayment(input: {
      invoiceId: string;
      paymentMethod: PaymentMethod;
      wechatTransactionRef: string;
      amount: string;
      receivedAt: Date;
      recordedByUserId: string;
      note?: string;
    }): Promise<FinancePaymentRecord> {
      const result = await pool.query<Record<string, unknown>>(
        `
        INSERT INTO finance_payments (
          invoice_id,
          payment_method,
          wechat_transaction_ref,
          amount,
          received_at,
          settlement_status,
          recorded_by_user_id,
          note,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5,'UNSETTLED',$6,$7,NOW(),NOW())
        RETURNING *
        `,
        [
          input.invoiceId,
          input.paymentMethod,
          input.wechatTransactionRef,
          input.amount,
          input.receivedAt,
          input.recordedByUserId,
          input.note ?? null
        ]
      );

      return mapPayment(result.rows[0] as Record<string, unknown>);
    },

    async createPaymentInTransaction(client: PoolClient, input: {
      invoiceId: string;
      paymentMethod: PaymentMethod;
      wechatTransactionRef: string;
      amount: string;
      receivedAt: Date;
      recordedByUserId: string;
      note?: string;
    }): Promise<FinancePaymentRecord> {
      const result = await client.query<Record<string, unknown>>(
        `
        INSERT INTO finance_payments (
          invoice_id,
          payment_method,
          wechat_transaction_ref,
          amount,
          received_at,
          settlement_status,
          recorded_by_user_id,
          note,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5,'UNSETTLED',$6,$7,NOW(),NOW())
        RETURNING *
        `,
        [
          input.invoiceId,
          input.paymentMethod,
          input.wechatTransactionRef,
          input.amount,
          input.receivedAt,
          input.recordedByUserId,
          input.note ?? null
        ]
      );

      return mapPayment(result.rows[0] as Record<string, unknown>);
    },

    async listInvoicePayments(invoiceId: string): Promise<FinancePaymentRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        'SELECT * FROM finance_payments WHERE invoice_id = $1 ORDER BY created_at DESC',
        [invoiceId]
      );

      return result.rows.map(mapPayment);
    },

    async findPaymentByWechatReference(wechatTransactionRef: string): Promise<FinancePaymentRecord | null> {
      const result = await pool.query<Record<string, unknown>>(
        'SELECT * FROM finance_payments WHERE wechat_transaction_ref = $1',
        [wechatTransactionRef]
      );
      const row = result.rows[0];
      return row ? mapPayment(row) : null;
    },

    async getPaymentById(paymentId: string): Promise<FinancePaymentRecord | null> {
      const result = await pool.query<Record<string, unknown>>('SELECT * FROM finance_payments WHERE id = $1', [paymentId]);
      const row = result.rows[0];
      return row ? mapPayment(row) : null;
    },

    async getPaymentByIdForInvoice(paymentId: string, invoiceId: string): Promise<FinancePaymentRecord | null> {
      const result = await pool.query<Record<string, unknown>>(
        'SELECT * FROM finance_payments WHERE id = $1 AND invoice_id = $2',
        [paymentId, invoiceId]
      );
      const row = result.rows[0];
      return row ? mapPayment(row) : null;
    },

    async updatePaymentSettlementStatus(input: {
      paymentId: string;
      settlementStatus: SettlementStatus;
      settlementImportId?: string;
    }): Promise<void> {
      await pool.query(
        `
        UPDATE finance_payments
        SET settlement_status = $2,
            settlement_import_id = $3,
            updated_at = NOW()
        WHERE id = $1
        `,
        [input.paymentId, input.settlementStatus, input.settlementImportId ?? null]
      );
    },

    async createRefund(input: {
      invoiceId: string;
      paymentId?: string;
      amount: string;
      refundMethod: RefundMethod;
      reason: string;
      wechatRefundReference?: string;
      bankAccountName?: string;
      bankRoutingNumberEncrypted?: string;
      bankAccountNumberEncrypted?: string;
      bankAccountLast4?: string;
      recordedByUserId: string;
      refundedAt: Date;
    }): Promise<FinanceRefundRecord> {
      const result = await pool.query<Record<string, unknown>>(
        `
        INSERT INTO finance_refunds (
          invoice_id,
          payment_id,
          amount,
          refund_method,
          reason,
          wechat_refund_reference,
          bank_account_name,
          bank_routing_number_encrypted,
          bank_account_number_encrypted,
          bank_account_last4,
          recorded_by_user_id,
          refunded_at,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
        RETURNING *
        `,
        [
          input.invoiceId,
          input.paymentId ?? null,
          input.amount,
          input.refundMethod,
          input.reason,
          input.wechatRefundReference ?? null,
          input.bankAccountName ?? null,
          input.bankRoutingNumberEncrypted ?? null,
          input.bankAccountNumberEncrypted ?? null,
          input.bankAccountLast4 ?? null,
          input.recordedByUserId,
          input.refundedAt
        ]
      );

      return mapRefund(result.rows[0] as Record<string, unknown>);
    },

    async createRefundInTransaction(client: PoolClient, input: {
      invoiceId: string;
      paymentId?: string;
      amount: string;
      refundMethod: RefundMethod;
      reason: string;
      wechatRefundReference?: string;
      bankAccountName?: string;
      bankRoutingNumberEncrypted?: string;
      bankAccountNumberEncrypted?: string;
      bankAccountLast4?: string;
      recordedByUserId: string;
      refundedAt: Date;
    }): Promise<FinanceRefundRecord> {
      const result = await client.query<Record<string, unknown>>(
        `
        INSERT INTO finance_refunds (
          invoice_id,
          payment_id,
          amount,
          refund_method,
          reason,
          wechat_refund_reference,
          bank_account_name,
          bank_routing_number_encrypted,
          bank_account_number_encrypted,
          bank_account_last4,
          recorded_by_user_id,
          refunded_at,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
        RETURNING *
        `,
        [
          input.invoiceId,
          input.paymentId ?? null,
          input.amount,
          input.refundMethod,
          input.reason,
          input.wechatRefundReference ?? null,
          input.bankAccountName ?? null,
          input.bankRoutingNumberEncrypted ?? null,
          input.bankAccountNumberEncrypted ?? null,
          input.bankAccountLast4 ?? null,
          input.recordedByUserId,
          input.refundedAt
        ]
      );

      return mapRefund(result.rows[0] as Record<string, unknown>);
    },

    async listInvoiceRefunds(invoiceId: string): Promise<FinanceRefundRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        'SELECT * FROM finance_refunds WHERE invoice_id = $1 ORDER BY created_at DESC',
        [invoiceId]
      );

      return result.rows.map(mapRefund);
    },

    async createSettlementImport(input: { sourceLabel: string; importedByUserId: string }): Promise<FinanceSettlementImportRecord> {
      const result = await pool.query<Record<string, unknown>>(
        `
        INSERT INTO finance_settlement_imports (
          source_label,
          imported_by_user_id,
          row_count,
          matched_count,
          exception_count,
          created_at
        ) VALUES ($1,$2,0,0,0,NOW())
        RETURNING *
        `,
        [input.sourceLabel, input.importedByUserId]
      );

      return mapSettlementImport(result.rows[0] as Record<string, unknown>);
    },

    async updateSettlementImportCounts(input: {
      importId: string;
      rowCount: number;
      matchedCount: number;
      exceptionCount: number;
    }): Promise<FinanceSettlementImportRecord> {
      const result = await pool.query<Record<string, unknown>>(
        `
        UPDATE finance_settlement_imports
        SET row_count = $2,
            matched_count = $3,
            exception_count = $4
        WHERE id = $1
        RETURNING *
        `,
        [input.importId, input.rowCount, input.matchedCount, input.exceptionCount]
      );

      return mapSettlementImport(result.rows[0] as Record<string, unknown>);
    },

    async createSettlementRow(input: {
      importId: string;
      rowNumber: number;
      wechatTransactionRef?: string;
      amount?: string;
      settledAt?: Date;
      status: SettlementRowStatus;
      exceptionReason?: string;
      matchedPaymentId?: string;
      rawRow: Record<string, unknown>;
    }): Promise<FinanceSettlementRowRecord> {
      const result = await pool.query<Record<string, unknown>>(
        `
        INSERT INTO finance_settlement_rows (
          import_id,
          row_number,
          wechat_transaction_ref,
          amount,
          settled_at,
          status,
          exception_reason,
          matched_payment_id,
          raw_row,
          created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,NOW())
        RETURNING *
        `,
        [
          input.importId,
          input.rowNumber,
          input.wechatTransactionRef ?? null,
          input.amount ?? null,
          input.settledAt ?? null,
          input.status,
          input.exceptionReason ?? null,
          input.matchedPaymentId ?? null,
          JSON.stringify(input.rawRow)
        ]
      );

      return mapSettlementRow(result.rows[0] as Record<string, unknown>);
    },

    async listSettlementExceptionRows(): Promise<FinanceSettlementExceptionRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT
          s.*,
          p.invoice_id AS matched_invoice_id,
          i.invoice_number AS matched_invoice_number
        FROM finance_settlement_rows s
        LEFT JOIN finance_payments p ON p.id = s.matched_payment_id
        LEFT JOIN finance_invoices i ON i.id = p.invoice_id
        WHERE s.status <> 'MATCHED'
          AND s.resolution_status = 'OPEN'
        ORDER BY s.created_at DESC, s.id DESC
        `
      );

      return result.rows.map((row) => ({
        ...mapSettlementRow(row),
        matchedInvoiceId: row.matched_invoice_id ? String(row.matched_invoice_id) : null,
        matchedInvoiceNumber: row.matched_invoice_number ? String(row.matched_invoice_number) : null
      }));
    },

    async listUnsettledPayments(): Promise<FinancePaymentRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT *
        FROM finance_payments
        WHERE settlement_status <> 'MATCHED'
        ORDER BY created_at DESC
        `
      );

      return result.rows.map(mapPayment);
    },

    async listResolvedSettlementExceptionRows(limit = 50): Promise<FinanceSettlementExceptionRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT
          s.*,
          p.invoice_id AS matched_invoice_id,
          i.invoice_number AS matched_invoice_number
        FROM finance_settlement_rows s
        LEFT JOIN finance_payments p ON p.id = s.matched_payment_id
        LEFT JOIN finance_invoices i ON i.id = p.invoice_id
        WHERE s.status <> 'MATCHED'
          AND s.resolution_status <> 'OPEN'
        ORDER BY s.resolved_at DESC NULLS LAST, s.id DESC
        LIMIT $1
        `,
        [limit]
      );

      return result.rows.map((row) => ({
        ...mapSettlementRow(row),
        matchedInvoiceId: row.matched_invoice_id ? String(row.matched_invoice_id) : null,
        matchedInvoiceNumber: row.matched_invoice_number ? String(row.matched_invoice_number) : null
      }));
    },

    async getSettlementExceptionRowById(rowId: number): Promise<FinanceSettlementExceptionRecord | null> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT
          s.*,
          p.invoice_id AS matched_invoice_id,
          i.invoice_number AS matched_invoice_number
        FROM finance_settlement_rows s
        LEFT JOIN finance_payments p ON p.id = s.matched_payment_id
        LEFT JOIN finance_invoices i ON i.id = p.invoice_id
        WHERE s.id = $1
        `,
        [rowId]
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        ...mapSettlementRow(row),
        matchedInvoiceId: row.matched_invoice_id ? String(row.matched_invoice_id) : null,
        matchedInvoiceNumber: row.matched_invoice_number ? String(row.matched_invoice_number) : null
      };
    },

    async resolveSettlementExceptionRow(input: {
      rowId: number;
      resolutionStatus: Exclude<SettlementExceptionResolutionStatus, 'OPEN'>;
      resolutionNote: string;
      resolvedByUserId: string;
    }): Promise<void> {
      await pool.query(
        `
        UPDATE finance_settlement_rows
        SET resolution_status = $2,
            resolution_note = $3,
            resolved_by_user_id = $4,
            resolved_at = NOW()
        WHERE id = $1
        `,
        [input.rowId, input.resolutionStatus, input.resolutionNote, input.resolvedByUserId]
      );
    },

    async countOpenExceptionsForInvoice(invoiceId: string): Promise<number> {
      const result = await pool.query<{ total: string }>(
        `
        SELECT COUNT(*)::text AS total
        FROM finance_settlement_rows s
        JOIN finance_payments p ON p.id = s.matched_payment_id
        WHERE p.invoice_id = $1
          AND s.status <> 'MATCHED'
          AND s.resolution_status = 'OPEN'
        `,
        [invoiceId]
      );

      return Number(result.rows[0]?.total ?? '0');
    },

    async createLedgerEntry(input: {
      invoiceId?: string;
      paymentId?: string;
      refundId?: string;
      settlementRowId?: number;
      entryType: LedgerEntryType;
      amount?: string;
      currencyCode: string;
      actorUserId: string;
      details: Record<string, unknown>;
    }): Promise<FinanceLedgerEntryRecord> {
      const result = await pool.query<Record<string, unknown>>(
        `
        INSERT INTO finance_ledger_entries (
          invoice_id,
          payment_id,
          refund_id,
          settlement_row_id,
          entry_type,
          amount,
          currency_code,
          actor_user_id,
          details,
          created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,NOW())
        RETURNING *
        `,
        [
          input.invoiceId ?? null,
          input.paymentId ?? null,
          input.refundId ?? null,
          input.settlementRowId ?? null,
          input.entryType,
          input.amount ?? null,
          input.currencyCode,
          input.actorUserId,
          JSON.stringify(input.details)
        ]
      );

      const row = result.rows[0] as Record<string, unknown>;
      return {
        ...mapLedger(row),
        actorUsername: null
      };
    },

    async createLedgerEntryInTransaction(client: PoolClient, input: {
      invoiceId?: string;
      paymentId?: string;
      refundId?: string;
      settlementRowId?: number;
      entryType: LedgerEntryType;
      amount?: string;
      currencyCode: string;
      actorUserId: string;
      details: Record<string, unknown>;
    }): Promise<FinanceLedgerEntryRecord> {
      const result = await client.query<Record<string, unknown>>(
        `
        INSERT INTO finance_ledger_entries (
          invoice_id,
          payment_id,
          refund_id,
          settlement_row_id,
          entry_type,
          amount,
          currency_code,
          actor_user_id,
          details,
          created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,NOW())
        RETURNING *
        `,
        [
          input.invoiceId ?? null,
          input.paymentId ?? null,
          input.refundId ?? null,
          input.settlementRowId ?? null,
          input.entryType,
          input.amount ?? null,
          input.currencyCode,
          input.actorUserId,
          JSON.stringify(input.details)
        ]
      );

      const row = result.rows[0] as Record<string, unknown>;
      return {
        ...mapLedger(row),
        actorUsername: null
      };
    },

    async listLedgerEntries(invoiceId?: string): Promise<FinanceLedgerEntryRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT
          l.*,
          u.username::text AS actor_username
        FROM finance_ledger_entries l
        JOIN users u ON u.id = l.actor_user_id
        ${invoiceId ? 'WHERE l.invoice_id = $1' : ''}
        ORDER BY l.created_at DESC, l.id DESC
        `,
        invoiceId ? [invoiceId] : []
      );

      return result.rows.map(mapLedger);
    }
  };
};
