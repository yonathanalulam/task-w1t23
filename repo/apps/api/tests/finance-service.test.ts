import { describe, expect, it, vi } from 'vitest';
import { decryptField } from '../src/lib/field-encryption.js';
import { createFinanceService } from '../src/modules/finance/service.js';

const makeInMemoryRepository = () => {
  const invoices = new Map<string, any>();
  const payments = new Map<string, any>();
  const refunds = new Map<string, any>();
  const imports = new Map<string, any>();
  const settlementRows: any[] = [];
  const ledger: any[] = [];

  let invoiceSeq = 1;
  let paymentSeq = 1;
  let refundSeq = 1;
  let importSeq = 1;
  let settlementSeq = 1;
  let ledgerSeq = 1;

  const now = () => new Date();

  const repository = {
    withTransaction: vi.fn(async (action: (client: object) => Promise<unknown>) => action({})),
    listInvoices: vi.fn(async (filters: { statuses?: string[]; hasOpenException?: boolean } = {}) => {
      let rows = [...invoices.values()];
      if (filters.statuses && filters.statuses.length > 0) {
        rows = rows.filter((row) => filters.statuses?.includes(row.status));
      }
      if (filters.hasOpenException !== undefined) {
        rows = rows.filter((row) => row.hasOpenException === filters.hasOpenException);
      }
      return rows;
    }),

    getInvoiceById: vi.fn(async (invoiceId: string) => invoices.get(invoiceId) ?? null),
    getInvoiceByIdForUpdate: vi.fn(async (_client: object, invoiceId: string) => invoices.get(invoiceId) ?? null),

    createInvoice: vi.fn(async (input: any) => {
      const record = {
        id: `invoice-${invoiceSeq++}`,
        invoiceNumber: input.invoiceNumber,
        customerUserId: input.customerUserId ?? null,
        serviceType: input.serviceType,
        serviceReferenceId: input.serviceReferenceId ?? null,
        description: input.description,
        currencyCode: input.currencyCode,
        totalAmount: input.totalAmount,
        paidAmount: '0.00',
        refundedAmount: '0.00',
        hasOpenException: false,
        status: input.status,
        dueAt: input.dueAt ?? null,
        issuedByUserId: input.issuedByUserId,
        issuedAt: now(),
        createdAt: now(),
        updatedAt: now()
      };

      invoices.set(record.id, record);
      return record;
    }),

    updateInvoiceFinancials: vi.fn(async (input: any) => {
      const invoice = invoices.get(input.invoiceId);
      if (!invoice) {
        throw new Error('invoice not found');
      }
      invoice.paidAmount = input.paidAmount;
      invoice.refundedAmount = input.refundedAmount;
      invoice.status = input.status;
      invoice.updatedAt = now();
      return invoice;
    }),
    updateInvoiceFinancialsInTransaction: vi.fn(async (_client: object, input: any) => {
      const invoice = invoices.get(input.invoiceId);
      if (!invoice) {
        throw new Error('invoice not found');
      }
      invoice.paidAmount = input.paidAmount;
      invoice.refundedAmount = input.refundedAmount;
      invoice.status = input.status;
      invoice.updatedAt = now();
      return invoice;
    }),

    setInvoiceExceptionFlag: vi.fn(async (invoiceId: string, hasOpenException: boolean) => {
      const invoice = invoices.get(invoiceId);
      if (invoice) {
        invoice.hasOpenException = hasOpenException;
      }
    }),

    createPayment: vi.fn(async (input: any) => {
      const duplicate = [...payments.values()].find((entry) => entry.wechatTransactionRef === input.wechatTransactionRef);
      if (duplicate) {
        const error = new Error('duplicate');
        (error as Error & { code?: string }).code = '23505';
        throw error;
      }

      const record = {
        id: `payment-${paymentSeq++}`,
        invoiceId: input.invoiceId,
        paymentMethod: input.paymentMethod,
        wechatTransactionRef: input.wechatTransactionRef,
        amount: input.amount,
        receivedAt: input.receivedAt,
        settlementStatus: 'UNSETTLED',
        settlementImportId: null,
        recordedByUserId: input.recordedByUserId,
        note: input.note ?? null,
        createdAt: now(),
        updatedAt: now()
      };

      payments.set(record.id, record);
      return record;
    }),
    createPaymentInTransaction: vi.fn(async (_client: object, input: any) => {
      const duplicate = [...payments.values()].find((entry) => entry.wechatTransactionRef === input.wechatTransactionRef);
      if (duplicate) {
        const error = new Error('duplicate');
        (error as Error & { code?: string }).code = '23505';
        throw error;
      }

      const record = {
        id: `payment-${paymentSeq++}`,
        invoiceId: input.invoiceId,
        paymentMethod: input.paymentMethod,
        wechatTransactionRef: input.wechatTransactionRef,
        amount: input.amount,
        receivedAt: input.receivedAt,
        settlementStatus: 'UNSETTLED',
        settlementImportId: null,
        recordedByUserId: input.recordedByUserId,
        note: input.note ?? null,
        createdAt: now(),
        updatedAt: now()
      };

      payments.set(record.id, record);
      return record;
    }),

    listInvoicePayments: vi.fn(async (invoiceId: string) => [...payments.values()].filter((row) => row.invoiceId === invoiceId)),

    findPaymentByWechatReference: vi.fn(async (wechatTransactionRef: string) => {
      return [...payments.values()].find((row) => row.wechatTransactionRef === wechatTransactionRef) ?? null;
    }),

    updatePaymentSettlementStatus: vi.fn(async (input: any) => {
      const payment = payments.get(input.paymentId);
      if (payment) {
        payment.settlementStatus = input.settlementStatus;
        payment.settlementImportId = input.settlementImportId ?? null;
        payment.updatedAt = now();
      }
    }),

    createRefund: vi.fn(async (input: any) => {
      const record = {
        id: `refund-${refundSeq++}`,
        invoiceId: input.invoiceId,
        paymentId: input.paymentId ?? null,
        amount: input.amount,
        refundMethod: input.refundMethod,
        reason: input.reason,
        wechatRefundReference: input.wechatRefundReference ?? null,
        bankAccountName: input.bankAccountName ?? null,
        bankRoutingNumberEncrypted: input.bankRoutingNumberEncrypted ?? null,
        bankAccountNumberEncrypted: input.bankAccountNumberEncrypted ?? null,
        bankAccountLast4: input.bankAccountLast4 ?? null,
        recordedByUserId: input.recordedByUserId,
        refundedAt: input.refundedAt,
        createdAt: now(),
        updatedAt: now()
      };

      refunds.set(record.id, record);
      return record;
    }),
    createRefundInTransaction: vi.fn(async (_client: object, input: any) => {
      const record = {
        id: `refund-${refundSeq++}`,
        invoiceId: input.invoiceId,
        paymentId: input.paymentId ?? null,
        amount: input.amount,
        refundMethod: input.refundMethod,
        reason: input.reason,
        wechatRefundReference: input.wechatRefundReference ?? null,
        bankAccountName: input.bankAccountName ?? null,
        bankRoutingNumberEncrypted: input.bankRoutingNumberEncrypted ?? null,
        bankAccountNumberEncrypted: input.bankAccountNumberEncrypted ?? null,
        bankAccountLast4: input.bankAccountLast4 ?? null,
        recordedByUserId: input.recordedByUserId,
        refundedAt: input.refundedAt,
        createdAt: now(),
        updatedAt: now()
      };

      refunds.set(record.id, record);
      return record;
    }),

    listInvoiceRefunds: vi.fn(async (invoiceId: string) => [...refunds.values()].filter((row) => row.invoiceId === invoiceId)),

    createSettlementImport: vi.fn(async (input: any) => {
      const record = {
        id: `import-${importSeq++}`,
        sourceLabel: input.sourceLabel,
        importedByUserId: input.importedByUserId,
        rowCount: 0,
        matchedCount: 0,
        exceptionCount: 0,
        createdAt: now()
      };
      imports.set(record.id, record);
      return record;
    }),

    updateSettlementImportCounts: vi.fn(async (input: any) => {
      const record = imports.get(input.importId);
      if (!record) {
        throw new Error('import not found');
      }
      record.rowCount = input.rowCount;
      record.matchedCount = input.matchedCount;
      record.exceptionCount = input.exceptionCount;
      return record;
    }),

    createSettlementRow: vi.fn(async (input: any) => {
      const record = {
        id: settlementSeq++,
        importId: input.importId,
        rowNumber: input.rowNumber,
        wechatTransactionRef: input.wechatTransactionRef ?? null,
        amount: input.amount ?? null,
        settledAt: input.settledAt ?? null,
        status: input.status,
        exceptionReason: input.exceptionReason ?? null,
        resolutionStatus: 'OPEN',
        resolutionNote: null,
        resolvedByUserId: null,
        resolvedAt: null,
        matchedPaymentId: input.matchedPaymentId ?? null,
        rawRow: input.rawRow,
        createdAt: now()
      };
      settlementRows.push(record);
      return record;
    }),

    listSettlementExceptionRows: vi.fn(async () =>
      settlementRows
        .filter((row) => row.status !== 'MATCHED' && row.resolutionStatus === 'OPEN')
        .map((row) => {
          const payment = row.matchedPaymentId ? payments.get(row.matchedPaymentId) : null;
          const invoice = payment ? invoices.get(payment.invoiceId) : null;
          return {
            ...row,
            matchedInvoiceId: invoice?.id ?? null,
            matchedInvoiceNumber: invoice?.invoiceNumber ?? null
          };
        })
    ),

    listUnsettledPayments: vi.fn(async () => [...payments.values()].filter((row) => row.settlementStatus !== 'MATCHED')),

    listResolvedSettlementExceptionRows: vi.fn(async () =>
      settlementRows
        .filter((row) => row.status !== 'MATCHED' && row.resolutionStatus !== 'OPEN')
        .map((row) => {
          const payment = row.matchedPaymentId ? payments.get(row.matchedPaymentId) : null;
          const invoice = payment ? invoices.get(payment.invoiceId) : null;
          return {
            ...row,
            matchedInvoiceId: invoice?.id ?? null,
            matchedInvoiceNumber: invoice?.invoiceNumber ?? null
          };
        })
    ),

    getSettlementExceptionRowById: vi.fn(async (rowId: number) => {
      const row = settlementRows.find((entry) => entry.id === rowId);
      if (!row) return null;
      const payment = row.matchedPaymentId ? payments.get(row.matchedPaymentId) : null;
      const invoice = payment ? invoices.get(payment.invoiceId) : null;
      return {
        ...row,
        matchedInvoiceId: invoice?.id ?? null,
        matchedInvoiceNumber: invoice?.invoiceNumber ?? null
      };
    }),

    resolveSettlementExceptionRow: vi.fn(async (input: any) => {
      const row = settlementRows.find((entry) => entry.id === input.rowId);
      if (!row) return;
      row.resolutionStatus = input.resolutionStatus;
      row.resolutionNote = input.resolutionNote;
      row.resolvedByUserId = input.resolvedByUserId;
      row.resolvedAt = now();
    }),

    countOpenExceptionsForInvoice: vi.fn(async (invoiceId: string) => {
      return settlementRows.filter((row) => {
        if (row.status === 'MATCHED' || row.resolutionStatus !== 'OPEN' || !row.matchedPaymentId) {
          return false;
        }
        const payment = payments.get(row.matchedPaymentId);
        return payment?.invoiceId === invoiceId;
      }).length;
    }),

    getPaymentById: vi.fn(async (paymentId: string) => payments.get(paymentId) ?? null),

    getPaymentByIdForInvoice: vi.fn(async (paymentId: string, invoiceId: string) => {
      const payment = payments.get(paymentId) ?? null;
      return payment && payment.invoiceId === invoiceId ? payment : null;
    }),

    createLedgerEntry: vi.fn(async (input: any) => {
      const record = {
        id: ledgerSeq++,
        invoiceId: input.invoiceId ?? null,
        paymentId: input.paymentId ?? null,
        refundId: input.refundId ?? null,
        settlementRowId: input.settlementRowId ?? null,
        entryType: input.entryType,
        amount: input.amount ?? null,
        currencyCode: input.currencyCode,
        actorUserId: input.actorUserId,
        actorUsername: null,
        details: input.details,
        createdAt: now()
      };
      ledger.push(record);
      return record;
    }),
    createLedgerEntryInTransaction: vi.fn(async (_client: object, input: any) => {
      const record = {
        id: ledgerSeq++,
        invoiceId: input.invoiceId ?? null,
        paymentId: input.paymentId ?? null,
        refundId: input.refundId ?? null,
        settlementRowId: input.settlementRowId ?? null,
        entryType: input.entryType,
        amount: input.amount ?? null,
        currencyCode: input.currencyCode,
        actorUserId: input.actorUserId,
        actorUsername: null,
        details: input.details,
        createdAt: now()
      };
      ledger.push(record);
      return record;
    }),

    listLedgerEntries: vi.fn(async (invoiceId?: string) =>
      invoiceId ? ledger.filter((entry) => entry.invoiceId === invoiceId) : [...ledger]
    )
  };

  return { repository };
};

describe('finance service', () => {
  it('creates invoice, records payment, records partial refund, and keeps ledger trace', async () => {
    const { repository } = makeInMemoryRepository();
    const service = createFinanceService({
      repository: repository as never,
      audit: { write: vi.fn(async () => undefined) },
      encryptionKey: 'finance-secret-key'
    });

    const invoice = await service.createInvoice({
      actorUserId: 'clerk-1',
      serviceType: 'OTHER',
      description: 'Consulting service',
      totalAmount: '100.00',
      meta: {}
    });

    const paymentResult = await service.recordPayment({
      actorUserId: 'clerk-1',
      invoiceId: invoice.id,
      amount: '100.00',
      wechatTransactionRef: 'wechat-001',
      receivedAt: '2026-02-01T10:00:00.000Z',
      meta: {}
    });

    expect(paymentResult.invoice.status).toBe('PAID');

    const refundResult = await service.recordRefund({
      actorUserId: 'clerk-1',
      invoiceId: invoice.id,
      amount: '40.00',
      refundMethod: 'WECHAT_OFFLINE',
      reason: 'Partial service cancellation',
      refundedAt: '2026-02-02T12:00:00.000Z',
      wechatRefundReference: 'wechat-refund-001',
      meta: {}
    });

    expect(refundResult.invoice.status).toBe('PARTIALLY_REFUNDED');

    const detail = await service.getInvoiceDetail(invoice.id);
    expect(detail.ledger.map((entry) => entry.entryType)).toEqual(['INVOICE_ISSUED', 'PAYMENT_RECORDED', 'REFUND_RECORDED']);
  });

  it('encrypts sensitive bank refund fields at rest', async () => {
    const { repository } = makeInMemoryRepository();
    const key = 'finance-secret-key';
    const service = createFinanceService({
      repository: repository as never,
      audit: { write: vi.fn(async () => undefined) },
      encryptionKey: key
    });

    const invoice = await service.createInvoice({
      actorUserId: 'clerk-1',
      serviceType: 'OTHER',
      description: 'Refundable service',
      totalAmount: '200.00',
      meta: {}
    });

    await service.recordPayment({
      actorUserId: 'clerk-1',
      invoiceId: invoice.id,
      amount: '200.00',
      wechatTransactionRef: 'wechat-enc-001',
      receivedAt: '2026-02-01T10:00:00.000Z',
      meta: {}
    });

    const result = await service.recordRefund({
      actorUserId: 'clerk-1',
      invoiceId: invoice.id,
      amount: '50.00',
      refundMethod: 'BANK_TRANSFER',
      reason: 'Bank transfer refund',
      refundedAt: '2026-02-03T09:00:00.000Z',
      bankAccountName: 'Researcher A',
      bankRoutingNumber: '110000111',
      bankAccountNumber: '6222000012345678',
      meta: {}
    });

    expect(result.refund.bankRoutingNumberEncrypted).toBeNull();
    expect(result.refund.bankAccountNumberEncrypted).toBeNull();
    expect(result.refund.bankAccountName).toBeNull();

    const storedRefund = (await repository.listInvoiceRefunds(invoice.id))[0];
    expect(storedRefund).toBeTruthy();
    expect(storedRefund.bankRoutingNumberEncrypted).toBeTruthy();
    expect(storedRefund.bankAccountNumberEncrypted).toBeTruthy();
    expect(storedRefund.bankRoutingNumberEncrypted).not.toContain('110000111');
    expect(storedRefund.bankAccountNumberEncrypted).not.toContain('6222000012345678');
    expect(decryptField(String(storedRefund.bankRoutingNumberEncrypted), key)).toBe('110000111');

    const detail = await service.getInvoiceDetail(invoice.id);
    expect(detail.refunds[0]?.bankRoutingNumberEncrypted).toBeNull();
    expect(detail.refunds[0]?.bankAccountNumberEncrypted).toBeNull();
    expect(detail.refunds[0]?.bankAccountName).toBeNull();
  });

  it('rejects refunds when payment belongs to a different invoice', async () => {
    const { repository } = makeInMemoryRepository();
    const service = createFinanceService({
      repository: repository as never,
      audit: { write: vi.fn(async () => undefined) },
      encryptionKey: 'finance-secret-key'
    });

    const invoiceA = await service.createInvoice({
      actorUserId: 'clerk-1',
      serviceType: 'OTHER',
      description: 'Invoice A',
      totalAmount: '100.00',
      meta: {}
    });

    const invoiceB = await service.createInvoice({
      actorUserId: 'clerk-1',
      serviceType: 'OTHER',
      description: 'Invoice B',
      totalAmount: '100.00',
      meta: {}
    });

    const payment = await service.recordPayment({
      actorUserId: 'clerk-1',
      invoiceId: invoiceB.id,
      amount: '100.00',
      wechatTransactionRef: 'wechat-cross-invoice-001',
      receivedAt: '2026-02-01T10:00:00.000Z',
      meta: {}
    });

    await expect(
      service.recordRefund({
        actorUserId: 'clerk-1',
        invoiceId: invoiceA.id,
        paymentId: payment.payment.id,
        amount: '10.00',
        refundMethod: 'WECHAT_OFFLINE',
        reason: 'Invalid cross invoice refund',
        refundedAt: '2026-02-02T12:00:00.000Z',
        wechatRefundReference: 'wechat-refund-cross-001',
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'PAYMENT_INVOICE_MISMATCH');
  });

  it('reconciles settlement imports and surfaces unmatched/mismatch exception queue', async () => {
    const { repository } = makeInMemoryRepository();
    const service = createFinanceService({
      repository: repository as never,
      audit: { write: vi.fn(async () => undefined) },
      encryptionKey: 'finance-secret-key'
    });

    const invoice = await service.createInvoice({
      actorUserId: 'clerk-1',
      serviceType: 'RESOURCE_BOOKING',
      description: 'Microscope session',
      totalAmount: '120.00',
      meta: {}
    });

    await service.recordPayment({
      actorUserId: 'clerk-1',
      invoiceId: invoice.id,
      amount: '120.00',
      wechatTransactionRef: 'wechat-match-001',
      receivedAt: '2026-03-01T08:00:00.000Z',
      meta: {}
    });

    await service.recordPayment({
      actorUserId: 'clerk-1',
      invoiceId: invoice.id,
      amount: '60.00',
      wechatTransactionRef: 'wechat-mismatch-001',
      receivedAt: '2026-03-01T08:10:00.000Z',
      meta: {}
    });

    const csv = [
      'wechatTransactionRef,amount,settledAt',
      'wechat-match-001,120.00,2026-03-05T10:00:00.000Z',
      'wechat-mismatch-001,55.00,2026-03-05T10:05:00.000Z',
      'wechat-unknown-001,33.00,2026-03-05T10:10:00.000Z'
    ].join('\n');

    const importResult = await service.importSettlementCsv({
      actorUserId: 'clerk-1',
      sourceLabel: 'daily_settlement.csv',
      csvText: csv,
      meta: {}
    });

    expect(importResult.import.matchedCount).toBe(1);
    expect(importResult.import.exceptionCount).toBe(2);

    const queue = await service.getReconciliationQueue();
    expect(queue.exceptionRows.length).toBeGreaterThanOrEqual(2);
    expect(queue.exceptionInvoices.some((entry) => entry.id === invoice.id)).toBe(true);
  });

  it('rejects duplicate offline WeChat transaction references', async () => {
    const { repository } = makeInMemoryRepository();
    const service = createFinanceService({
      repository: repository as never,
      audit: { write: vi.fn(async () => undefined) },
      encryptionKey: 'finance-secret-key'
    });

    const invoice = await service.createInvoice({
      actorUserId: 'clerk-1',
      serviceType: 'OTHER',
      description: 'Invoice duplicate ref check',
      totalAmount: '90.00',
      meta: {}
    });

    await service.recordPayment({
      actorUserId: 'clerk-1',
      invoiceId: invoice.id,
      amount: '50.00',
      wechatTransactionRef: 'wechat-dup-001',
      receivedAt: '2026-03-10T08:00:00.000Z',
      meta: {}
    });

    await expect(
      service.recordPayment({
        actorUserId: 'clerk-1',
        invoiceId: invoice.id,
        amount: '40.00',
        wechatTransactionRef: 'wechat-dup-001',
        receivedAt: '2026-03-10T09:00:00.000Z',
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'DUPLICATE_WECHAT_TRANSACTION_REFERENCE');
  });

  it('rejects settlement import CSV without required header columns', async () => {
    const { repository } = makeInMemoryRepository();
    const service = createFinanceService({
      repository: repository as never,
      audit: { write: vi.fn(async () => undefined) },
      encryptionKey: 'finance-secret-key'
    });

    await expect(
      service.importSettlementCsv({
        actorUserId: 'clerk-1',
        sourceLabel: 'broken.csv',
        csvText: 'ref,amount\nwx-1,20.00',
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'INVALID_SETTLEMENT_CSV_HEADER');
  });

  it('parses settlement CSV rows with quoted commas', async () => {
    const { repository } = makeInMemoryRepository();
    const service = createFinanceService({
      repository: repository as never,
      audit: { write: vi.fn(async () => undefined) },
      encryptionKey: 'finance-secret-key'
    });

    const invoice = await service.createInvoice({
      actorUserId: 'clerk-1',
      serviceType: 'OTHER',
      description: 'Quoted CSV invoice',
      totalAmount: '10.00',
      meta: {}
    });

    await service.recordPayment({
      actorUserId: 'clerk-1',
      invoiceId: invoice.id,
      amount: '10.00',
      wechatTransactionRef: 'wechat,quoted-001',
      receivedAt: '2026-03-01T08:00:00.000Z',
      meta: {}
    });

    const result = await service.importSettlementCsv({
      actorUserId: 'clerk-1',
      sourceLabel: 'quoted.csv',
      csvText: 'wechatTransactionRef,amount,settledAt\n"wechat,quoted-001",10.00,2026-03-05T10:00:00.000Z',
      meta: {}
    });

    expect(result.import.matchedCount).toBe(1);
    expect((result.rows[0] as any)?.wechatTransactionRef).toBe('wechat,quoted-001');
  });

  it('parses settlement CSV rows with quoted embedded newlines', async () => {
    const { repository } = makeInMemoryRepository();
    const service = createFinanceService({
      repository: repository as never,
      audit: { write: vi.fn(async () => undefined) },
      encryptionKey: 'finance-secret-key'
    });

    const invoice = await service.createInvoice({
      actorUserId: 'clerk-1',
      serviceType: 'OTHER',
      description: 'Newline CSV invoice',
      totalAmount: '15.00',
      meta: {}
    });

    await service.recordPayment({
      actorUserId: 'clerk-1',
      invoiceId: invoice.id,
      amount: '15.00',
      wechatTransactionRef: 'wechat-newline-001',
      receivedAt: '2026-03-01T08:00:00.000Z',
      meta: {}
    });

    const result = await service.importSettlementCsv({
      actorUserId: 'clerk-1',
      sourceLabel: 'newline.csv',
      csvText: 'wechatTransactionRef,amount,settledAt\nwechat-newline-001,15.00,"2026-03-05T10:00:00.000Z\n"',
      meta: {}
    });

    expect(result.import.matchedCount).toBe(1);
    expect((result.rows[0] as any)?.settledAt?.toISOString()).toBe('2026-03-05T10:00:00.000Z');
  });

  it('supports explicit resolve and close lifecycle for reconciliation exceptions', async () => {
    const { repository } = makeInMemoryRepository();
    const service = createFinanceService({
      repository: repository as never,
      audit: { write: vi.fn(async () => undefined) },
      encryptionKey: 'finance-secret-key'
    });

    const invoice = await service.createInvoice({
      actorUserId: 'clerk-1',
      serviceType: 'OTHER',
      description: 'Lifecycle test invoice',
      totalAmount: '100.00',
      meta: {}
    });

    await service.recordPayment({
      actorUserId: 'clerk-1',
      invoiceId: invoice.id,
      amount: '60.00',
      wechatTransactionRef: 'wechat-lifecycle-001',
      receivedAt: '2026-03-11T09:00:00.000Z',
      meta: {}
    });

    await service.importSettlementCsv({
      actorUserId: 'clerk-1',
      sourceLabel: 'exceptions.csv',
      csvText: ['wechatTransactionRef,amount,settledAt', 'wechat-lifecycle-001,59.00,2026-03-12T10:00:00.000Z'].join('\n'),
      meta: {}
    });

    const queueBefore = await service.getReconciliationQueue();
    const openRow = queueBefore.exceptionRows.find((row) => row.wechatTransactionRef === 'wechat-lifecycle-001');
    expect(openRow).toBeTruthy();

    const resolved = await service.resolveSettlementException({
      actorUserId: 'clerk-1',
      settlementRowId: Number(openRow?.id),
      resolutionNote: 'Resolved after manual payment amount correction.',
      meta: {}
    });

    expect(resolved?.resolutionStatus).toBe('RESOLVED');

    await service.importSettlementCsv({
      actorUserId: 'clerk-1',
      sourceLabel: 'exceptions-close.csv',
      csvText: ['wechatTransactionRef,amount,settledAt', 'wechat-unknown-close,11.00,2026-03-12T10:10:00.000Z'].join('\n'),
      meta: {}
    });

    const queueForClose = await service.getReconciliationQueue();
    const rowToClose = queueForClose.exceptionRows.find((row) => row.wechatTransactionRef === 'wechat-unknown-close');
    expect(rowToClose).toBeTruthy();

    const closed = await service.closeSettlementException({
      actorUserId: 'clerk-1',
      settlementRowId: Number(rowToClose?.id),
      resolutionNote: 'Closed as non-actionable unmatched settlement line.',
      meta: {}
    });

    expect(closed?.resolutionStatus).toBe('CLOSED');

    const queueAfter = await service.getReconciliationQueue();
    expect(queueAfter.exceptionRows.some((row) => row.id === resolved?.id)).toBe(false);
    expect(queueAfter.resolvedExceptionRows.length).toBeGreaterThanOrEqual(2);
    const ledger = await service.listLedgerEntries(invoice.id);
    expect(ledger.some((entry) => entry.entryType === 'SETTLEMENT_EXCEPTION_RESOLVED')).toBe(true);
  });
});
