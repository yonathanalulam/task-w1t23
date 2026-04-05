import { randomUUID } from 'node:crypto';
import { encryptField } from '../../lib/field-encryption.js';
import { HttpError } from '../../lib/http-error.js';
import type { AuditWriteInput } from '../audit/types.js';
import { createFinanceRepository } from './repository.js';
import type { FinanceInvoiceRecord, InvoiceStatus, SettlementRowStatus } from './types.js';

type FinanceRepository = ReturnType<typeof createFinanceRepository>;

interface AuditWriter {
  write(input: AuditWriteInput): Promise<void>;
}

const toMeta = (meta: { requestId?: string; ip?: string; userAgent?: string }) => ({
  ...(meta.requestId ? { requestId: meta.requestId } : {}),
  ...(meta.ip ? { ip: meta.ip } : {}),
  ...(meta.userAgent ? { userAgent: meta.userAgent } : {})
});

const parseMoneyToCents = (value: string | number, code: string, message: string): number => {
  const raw = typeof value === 'number' ? value.toString() : value.trim();
  if (!raw) {
    throw new HttpError(400, code, message);
  }

  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new HttpError(400, code, message);
  }

  return Math.round(numeric * 100);
};

const toCentsFromRecord = (value: string): number => Math.round(Number(value) * 100);
const centsToAmount = (cents: number): string => (cents / 100).toFixed(2);

const sanitizeRefundForClient = <T extends {
  bankRoutingNumberEncrypted: string | null;
  bankAccountNumberEncrypted: string | null;
  bankAccountName: string | null;
}>(
  refund: T
): T => {
  return {
    ...refund,
    bankRoutingNumberEncrypted: null,
    bankAccountNumberEncrypted: null,
    bankAccountName: null
  };
};

const computeInvoiceStatus = (totalCents: number, paidCents: number, refundedCents: number): InvoiceStatus => {
  if (refundedCents > 0) {
    if (paidCents > 0 && refundedCents >= paidCents) {
      return 'REFUNDED';
    }

    return 'PARTIALLY_REFUNDED';
  }

  if (paidCents <= 0) {
    return 'ISSUED';
  }

  if (paidCents < totalCents) {
    return 'PARTIALLY_PAID';
  }

  return 'PAID';
};

const parseCsvRows = (csvText: string): Array<{ lineNumber: number; rawRow: string; columns: string[] }> => {
  const rows: Array<{ lineNumber: number; rawRow: string; columns: string[] }> = [];
  let currentField = '';
  let currentRow: string[] = [];
  let currentRawRow = '';
  let rowLineNumber = 1;
  let lineNumber = 1;
  let inQuotes = false;

  const finalizeRow = () => {
    currentRow.push(currentField);
    const hasContent = currentRow.some((field) => field.length > 0);
    if (hasContent) {
      rows.push({
        lineNumber: rowLineNumber,
        rawRow: currentRawRow,
        columns: currentRow
      });
    }

    currentField = '';
    currentRow = [];
    currentRawRow = '';
    rowLineNumber = lineNumber;
  };

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index] ?? '';
    const nextChar = csvText[index + 1] ?? '';

    if (char === '"') {
      currentRawRow += char;
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        currentRawRow += nextChar;
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ',') {
      currentField = currentField.trim();
      currentRow.push(currentField);
      currentField = '';
      currentRawRow += char;
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && nextChar === '\n') {
        currentRawRow += '\r\n';
        index += 1;
      } else {
        currentRawRow += char;
      }

      currentField = currentField.trim();
      lineNumber += 1;
      finalizeRow();
      continue;
    }

    currentField += char;
    currentRawRow += char;
  }

  if (inQuotes) {
    throw new HttpError(400, 'INVALID_SETTLEMENT_CSV', 'Settlement CSV contains an unterminated quoted field.');
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentField = currentField.trim();
    finalizeRow();
  }

  if (rows.length < 2) {
    throw new HttpError(400, 'INVALID_SETTLEMENT_CSV', 'Settlement CSV must include a header row and at least one data row.');
  }

  return rows;
};

const parseSettlementDate = (value: string): Date | null => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

export const createFinanceService = (deps: {
  repository: FinanceRepository;
  audit: AuditWriter;
  encryptionKey: string | undefined;
}) => {
  const { repository, audit, encryptionKey } = deps;

  const resolveExceptionLifecycle = async (input: {
    actorUserId: string;
    settlementRowId: number;
    resolutionStatus: 'RESOLVED' | 'CLOSED';
    resolutionNote: string;
    meta: { requestId?: string; ip?: string; userAgent?: string };
  }) => {
    const row = await repository.getSettlementExceptionRowById(input.settlementRowId);
    if (!row || row.status === 'MATCHED') {
      throw new HttpError(404, 'SETTLEMENT_EXCEPTION_NOT_FOUND', 'Settlement exception row was not found.');
    }

    if (row.resolutionStatus !== 'OPEN') {
      throw new HttpError(409, 'SETTLEMENT_EXCEPTION_ALREADY_RESOLVED', 'Settlement exception row is already resolved or closed.');
    }

    const resolutionNote = input.resolutionNote.trim();
    if (!resolutionNote) {
      throw new HttpError(400, 'RESOLUTION_NOTE_REQUIRED', 'Resolution note is required.');
    }

    await repository.resolveSettlementExceptionRow({
      rowId: row.id,
      resolutionStatus: input.resolutionStatus,
      resolutionNote,
      resolvedByUserId: input.actorUserId
    });

    if (row.matchedPaymentId) {
      const payment = await repository.getPaymentById(row.matchedPaymentId);
      if (payment && payment.settlementStatus === 'EXCEPTION') {
        await repository.updatePaymentSettlementStatus({
          paymentId: payment.id,
          settlementStatus: 'UNSETTLED'
        });
      }
    }

    if (row.matchedInvoiceId) {
      const openExceptionCount = await repository.countOpenExceptionsForInvoice(row.matchedInvoiceId);
      await repository.setInvoiceExceptionFlag(row.matchedInvoiceId, openExceptionCount > 0);
    }

    await repository.createLedgerEntry({
      ...(row.matchedInvoiceId ? { invoiceId: row.matchedInvoiceId } : {}),
      ...(row.matchedPaymentId ? { paymentId: row.matchedPaymentId } : {}),
      settlementRowId: row.id,
      entryType: input.resolutionStatus === 'RESOLVED' ? 'SETTLEMENT_EXCEPTION_RESOLVED' : 'SETTLEMENT_EXCEPTION_CLOSED',
      ...(row.amount ? { amount: row.amount } : {}),
      currencyCode: 'CNY',
      actorUserId: input.actorUserId,
      details: {
        status: row.status,
        priorExceptionReason: row.exceptionReason,
        resolutionStatus: input.resolutionStatus,
        resolutionNote
      }
    });

    await audit.write({
      actorUserId: input.actorUserId,
      eventType: 'FINANCE_SETTLEMENT_EXCEPTION_RESOLVED',
      entityType: 'finance_settlement_row',
      entityId: String(row.id),
      outcome: 'success',
      details: {
        settlementRowId: row.id,
        resolutionStatus: input.resolutionStatus,
        matchedInvoiceId: row.matchedInvoiceId,
        matchedPaymentId: row.matchedPaymentId
      },
      ...toMeta(input.meta)
    });

    return repository.getSettlementExceptionRowById(row.id);
  };

  return {
    async listInvoices(statuses?: string[]) {
      const normalized = statuses?.filter(Boolean) as InvoiceStatus[] | undefined;
      return normalized ? repository.listInvoices({ statuses: normalized }) : repository.listInvoices();
    },

    async createInvoice(input: {
      actorUserId: string;
      customerUserId?: string;
      serviceType: 'RESOURCE_BOOKING' | 'JOURNAL_SERVICE' | 'OTHER';
      serviceReferenceId?: string;
      description: string;
      totalAmount: string;
      dueAt?: string;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }): Promise<FinanceInvoiceRecord> {
      const description = input.description.trim();
      if (!description) {
        throw new HttpError(400, 'INVOICE_DESCRIPTION_REQUIRED', 'Invoice description is required.');
      }

      const totalCents = parseMoneyToCents(input.totalAmount, 'INVALID_INVOICE_AMOUNT', 'Invoice total amount must be greater than zero.');
      const dueAt = input.dueAt ? parseSettlementDate(input.dueAt) : null;
      if (input.dueAt && !dueAt) {
        throw new HttpError(400, 'INVALID_INVOICE_DUE_AT', 'Invoice due date-time must be valid.');
      }

      const now = new Date();
      const invoiceNumber = `INV-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const invoice = await repository.createInvoice({
        invoiceNumber,
        ...(input.customerUserId ? { customerUserId: input.customerUserId } : {}),
        serviceType: input.serviceType,
        ...(input.serviceReferenceId ? { serviceReferenceId: input.serviceReferenceId } : {}),
        description,
        currencyCode: 'CNY',
        totalAmount: centsToAmount(totalCents),
        status: 'ISSUED',
        ...(dueAt ? { dueAt } : {}),
        issuedByUserId: input.actorUserId
      });

      await repository.createLedgerEntry({
        invoiceId: invoice.id,
        entryType: 'INVOICE_ISSUED',
        amount: invoice.totalAmount,
        currencyCode: invoice.currencyCode,
        actorUserId: input.actorUserId,
        details: {
          invoiceNumber: invoice.invoiceNumber,
          serviceType: invoice.serviceType,
          description: invoice.description
        }
      });

      await audit.write({
        actorUserId: input.actorUserId,
        eventType: 'FINANCE_INVOICE_CREATED',
        entityType: 'finance_invoice',
        entityId: invoice.id,
        outcome: 'success',
        details: {
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoice.totalAmount,
          serviceType: invoice.serviceType
        },
        ...toMeta(input.meta)
      });

      return invoice;
    },

    async getInvoiceDetail(invoiceId: string) {
      const invoice = await repository.getInvoiceById(invoiceId);
      if (!invoice) {
        throw new HttpError(404, 'INVOICE_NOT_FOUND', 'Invoice was not found.');
      }

      const [payments, refunds, ledger] = await Promise.all([
        repository.listInvoicePayments(invoiceId),
        repository.listInvoiceRefunds(invoiceId),
        repository.listLedgerEntries(invoiceId)
      ]);

      return {
        invoice,
        payments,
        refunds: refunds.map((refund) => sanitizeRefundForClient(refund)),
        ledger
      };
    },

    async recordPayment(input: {
      actorUserId: string;
      invoiceId: string;
      amount: string;
      wechatTransactionRef: string;
      receivedAt: string;
      note?: string;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      const amountCents = parseMoneyToCents(input.amount, 'INVALID_PAYMENT_AMOUNT', 'Payment amount must be greater than zero.');
      const ref = input.wechatTransactionRef.trim();
      if (!ref) {
        throw new HttpError(400, 'WECHAT_REFERENCE_REQUIRED', 'Offline WeChat transaction reference is required.');
      }

      const receivedAt = parseSettlementDate(input.receivedAt);
      if (!receivedAt) {
        throw new HttpError(400, 'INVALID_PAYMENT_RECEIVED_AT', 'Payment received date-time must be valid.');
      }

      const { invoice, payment } = await repository.withTransaction(async (client) => {
        const invoice = await repository.getInvoiceByIdForUpdate(client, input.invoiceId);
        if (!invoice) {
          throw new HttpError(404, 'INVOICE_NOT_FOUND', 'Invoice was not found.');
        }

        const totalCents = toCentsFromRecord(invoice.totalAmount);
        const nextPaidCents = toCentsFromRecord(invoice.paidAmount) + amountCents;
        const refundedCents = toCentsFromRecord(invoice.refundedAmount);
        const nextStatus = computeInvoiceStatus(totalCents, nextPaidCents, refundedCents);

        let payment;
        try {
          payment = await repository.createPaymentInTransaction(client, {
            invoiceId: invoice.id,
            paymentMethod: 'WECHAT_OFFLINE',
            wechatTransactionRef: ref,
            amount: centsToAmount(amountCents),
            receivedAt,
            recordedByUserId: input.actorUserId,
            ...(input.note?.trim() ? { note: input.note.trim() } : {})
          });
        } catch (error) {
          if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === '23505') {
            throw new HttpError(409, 'DUPLICATE_WECHAT_TRANSACTION_REFERENCE', 'This WeChat transaction reference was already recorded.');
          }
          throw error;
        }

        const updatedInvoice = await repository.updateInvoiceFinancialsInTransaction(client, {
          invoiceId: invoice.id,
          paidAmount: centsToAmount(nextPaidCents),
          refundedAmount: invoice.refundedAmount,
          status: nextStatus
        });

        await repository.createLedgerEntryInTransaction(client, {
          invoiceId: invoice.id,
          paymentId: payment.id,
          entryType: 'PAYMENT_RECORDED',
          amount: payment.amount,
          currencyCode: invoice.currencyCode,
          actorUserId: input.actorUserId,
          details: {
            paymentMethod: payment.paymentMethod,
            wechatTransactionRef: payment.wechatTransactionRef,
            settlementStatus: payment.settlementStatus
          }
        });

        return {
          invoice: updatedInvoice,
          payment
        };
      });

      await audit.write({
        actorUserId: input.actorUserId,
        eventType: 'FINANCE_PAYMENT_RECORDED',
        entityType: 'finance_payment',
        entityId: payment.id,
        outcome: 'success',
        details: {
          invoiceId: invoice.id,
          amount: payment.amount,
          wechatTransactionRef: payment.wechatTransactionRef
        },
        ...toMeta(input.meta)
      });

      return {
        invoice,
        payment
      };
    },

    async recordRefund(input: {
      actorUserId: string;
      invoiceId: string;
      paymentId?: string;
      amount: string;
      refundMethod: 'WECHAT_OFFLINE' | 'BANK_TRANSFER';
      reason: string;
      refundedAt: string;
      wechatRefundReference?: string;
      bankAccountName?: string;
      bankRoutingNumber?: string;
      bankAccountNumber?: string;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      const reason = input.reason.trim();
      if (!reason) {
        throw new HttpError(400, 'REFUND_REASON_REQUIRED', 'Refund reason is required.');
      }

      const amountCents = parseMoneyToCents(input.amount, 'INVALID_REFUND_AMOUNT', 'Refund amount must be greater than zero.');
      const refundedAt = parseSettlementDate(input.refundedAt);
      if (!refundedAt) {
        throw new HttpError(400, 'INVALID_REFUND_DATE', 'Refund date-time must be valid.');
      }

      let wechatRefundReference: string | undefined;
      let bankAccountName: string | undefined;
      let bankRoutingNumberEncrypted: string | undefined;
      let bankAccountNumberEncrypted: string | undefined;
      let bankAccountLast4: string | undefined;

      if (input.refundMethod === 'WECHAT_OFFLINE') {
        const ref = input.wechatRefundReference?.trim() ?? '';
        if (!ref) {
          throw new HttpError(400, 'WECHAT_REFUND_REFERENCE_REQUIRED', 'WeChat refund reference is required for offline WeChat refunds.');
        }
        wechatRefundReference = ref;
      } else {
        const routing = input.bankRoutingNumber?.trim() ?? '';
        const account = input.bankAccountNumber?.trim() ?? '';
        bankAccountName = input.bankAccountName?.trim() || 'Unknown recipient';

        if (!routing || !account) {
          throw new HttpError(400, 'BANK_REFUND_DETAILS_REQUIRED', 'Bank routing and account numbers are required for bank transfer refunds.');
        }

        if (!encryptionKey) {
          throw new HttpError(500, 'ENCRYPTION_KEY_MISSING', 'Refund encryption key is not configured.');
        }

        bankRoutingNumberEncrypted = encryptField(routing, encryptionKey);
        bankAccountNumberEncrypted = encryptField(account, encryptionKey);
        bankAccountLast4 = account.slice(-4);
      }


      const { invoice, refund } = await repository.withTransaction(async (client) => {
        const invoice = await repository.getInvoiceByIdForUpdate(client, input.invoiceId);
        if (!invoice) {
          throw new HttpError(404, 'INVOICE_NOT_FOUND', 'Invoice was not found.');
        }

        if (input.paymentId) {
          const payment = await repository.getPaymentByIdForInvoice(input.paymentId, input.invoiceId);
          if (!payment) {
            const anyPayment = await repository.getPaymentById(input.paymentId);
            if (anyPayment) {
              throw new HttpError(409, 'PAYMENT_INVOICE_MISMATCH', 'Refund payment reference does not belong to the specified invoice.');
            }

            throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Referenced payment was not found.');
          }
        }

        const availableRefundCents = toCentsFromRecord(invoice.paidAmount) - toCentsFromRecord(invoice.refundedAmount);
        if (amountCents > availableRefundCents) {
          throw new HttpError(409, 'REFUND_EXCEEDS_AVAILABLE_BALANCE', 'Refund amount exceeds available paid balance.');
        }

        const refund = await repository.createRefundInTransaction(client, {
          invoiceId: invoice.id,
          ...(input.paymentId ? { paymentId: input.paymentId } : {}),
          amount: centsToAmount(amountCents),
          refundMethod: input.refundMethod,
          reason,
          ...(wechatRefundReference ? { wechatRefundReference } : {}),
          ...(bankAccountName ? { bankAccountName } : {}),
          ...(bankRoutingNumberEncrypted ? { bankRoutingNumberEncrypted } : {}),
          ...(bankAccountNumberEncrypted ? { bankAccountNumberEncrypted } : {}),
          ...(bankAccountLast4 ? { bankAccountLast4 } : {}),
          recordedByUserId: input.actorUserId,
          refundedAt
        });

        const nextRefundedCents = toCentsFromRecord(invoice.refundedAmount) + amountCents;
        const totalCents = toCentsFromRecord(invoice.totalAmount);
        const paidCents = toCentsFromRecord(invoice.paidAmount);

        const updatedInvoice = await repository.updateInvoiceFinancialsInTransaction(client, {
          invoiceId: invoice.id,
          paidAmount: invoice.paidAmount,
          refundedAmount: centsToAmount(nextRefundedCents),
          status: computeInvoiceStatus(totalCents, paidCents, nextRefundedCents)
        });

        await repository.createLedgerEntryInTransaction(client, {
          invoiceId: invoice.id,
          refundId: refund.id,
          entryType: 'REFUND_RECORDED',
          amount: refund.amount,
          currencyCode: invoice.currencyCode,
          actorUserId: input.actorUserId,
          details: {
            refundMethod: refund.refundMethod,
            reason: refund.reason,
            ...(refund.wechatRefundReference ? { wechatRefundReference: refund.wechatRefundReference } : {}),
            ...(refund.bankAccountLast4 ? { bankAccountLast4: refund.bankAccountLast4 } : {})
          }
        });

        return {
          invoice: updatedInvoice,
          refund
        };
      });

      await audit.write({
        actorUserId: input.actorUserId,
        eventType: 'FINANCE_REFUND_RECORDED',
        entityType: 'finance_refund',
        entityId: refund.id,
        outcome: 'success',
        details: {
          invoiceId: invoice.id,
          amount: refund.amount,
          refundMethod: refund.refundMethod
        },
        ...toMeta(input.meta)
      });

      return {
        invoice,
        refund: sanitizeRefundForClient(refund)
      };
    },

    async importSettlementCsv(input: {
      actorUserId: string;
      sourceLabel: string;
      csvText: string;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      const sourceLabel = input.sourceLabel.trim() || 'manual_csv_import';
      const csvText = input.csvText.trim();
      if (!csvText) {
        throw new HttpError(400, 'SETTLEMENT_CSV_REQUIRED', 'Settlement CSV content is required.');
      }

      const parsedRows = parseCsvRows(csvText);
      const headerRow = parsedRows[0];
      if (!headerRow) {
        throw new HttpError(400, 'INVALID_SETTLEMENT_CSV', 'Settlement CSV is missing a header row.');
      }

      const header = headerRow.columns.map((entry) => entry.trim().toLowerCase());
      const refIndex = header.findIndex((col) => ['wechattransactionref', 'wechat_transaction_ref', 'transactionref'].includes(col));
      const amountIndex = header.findIndex((col) => col === 'amount');
      const settledAtIndex = header.findIndex((col) => ['settledat', 'settled_at'].includes(col));

      if (refIndex < 0 || amountIndex < 0 || settledAtIndex < 0) {
        throw new HttpError(
          400,
          'INVALID_SETTLEMENT_CSV_HEADER',
          'CSV header must include wechatTransactionRef, amount, and settledAt columns.'
        );
      }
      const importRecord = await repository.createSettlementImport({
        sourceLabel,
        importedByUserId: input.actorUserId
      });

      let matchedCount = 0;
      let exceptionCount = 0;
      const seenRefs = new Set<string>();
      const settlementRows = [];

      for (const row of parsedRows.slice(1)) {
        const ref = row.columns[refIndex] ?? '';
        const amountRaw = row.columns[amountIndex] ?? '';
        const settledAtRaw = row.columns[settledAtIndex] ?? '';

        const rawRow = {
          csvLine: row.lineNumber,
          raw: row.rawRow,
          wechatTransactionRef: ref,
          amount: amountRaw,
          settledAt: settledAtRaw
        };

        let status: SettlementRowStatus = 'INVALID_ROW';
        let exceptionReason = 'Row parsing failed.';
        let matchedPaymentId: string | undefined;
        let amountForRow: string | undefined;
        let settledAt: Date | undefined;
        let linkedInvoiceId: string | undefined;

        const settledAtParsed = parseSettlementDate(settledAtRaw);

        if (!ref || !amountRaw || !settledAtParsed) {
          status = 'INVALID_ROW';
          exceptionReason = 'Missing or invalid ref/amount/settledAt value.';
        } else {
          try {
            settledAt = settledAtParsed;
            const amountCents = parseMoneyToCents(amountRaw, 'INVALID_SETTLEMENT_AMOUNT', 'Settlement amount must be valid and positive.');
            amountForRow = centsToAmount(amountCents);

            if (seenRefs.has(ref)) {
              status = 'DUPLICATE_REF';
              exceptionReason = 'Duplicate transaction reference in this import file.';
            } else {
              seenRefs.add(ref);
              const payment = await repository.findPaymentByWechatReference(ref);

              if (!payment) {
                status = 'UNMATCHED';
                exceptionReason = 'No recorded payment found for this transaction reference.';
              } else {
                matchedPaymentId = payment.id;
                linkedInvoiceId = payment.invoiceId;

                const paymentAmountCents = toCentsFromRecord(payment.amount);
                if (payment.settlementStatus === 'MATCHED') {
                  status = 'DUPLICATE_REF';
                  exceptionReason = 'Payment was already matched in a previous settlement import.';
                } else if (paymentAmountCents !== amountCents) {
                  status = 'AMOUNT_MISMATCH';
                  exceptionReason = 'Settlement amount does not match recorded payment amount.';
                  await repository.updatePaymentSettlementStatus({
                    paymentId: payment.id,
                    settlementStatus: 'EXCEPTION',
                    settlementImportId: importRecord.id
                  });
                  await repository.setInvoiceExceptionFlag(payment.invoiceId, true);
                } else {
                  status = 'MATCHED';
                  exceptionReason = '';
                  await repository.updatePaymentSettlementStatus({
                    paymentId: payment.id,
                    settlementStatus: 'MATCHED',
                    settlementImportId: importRecord.id
                  });
                }
              }
            }
          } catch {
            status = 'INVALID_ROW';
            exceptionReason = 'Invalid settlement amount format.';
          }
        }

        const settlementRow = await repository.createSettlementRow({
          importId: importRecord.id,
          rowNumber: row.lineNumber,
          ...(ref ? { wechatTransactionRef: ref } : {}),
          ...(amountForRow ? { amount: amountForRow } : {}),
          ...(settledAt ? { settledAt } : {}),
          status,
          ...(exceptionReason ? { exceptionReason } : {}),
          ...(matchedPaymentId ? { matchedPaymentId } : {}),
          rawRow
        });

        settlementRows.push(settlementRow);

        if (status === 'MATCHED') {
          matchedCount += 1;
          await repository.createLedgerEntry({
            ...(linkedInvoiceId ? { invoiceId: linkedInvoiceId } : {}),
            ...(matchedPaymentId ? { paymentId: matchedPaymentId } : {}),
            settlementRowId: settlementRow.id,
            entryType: 'SETTLEMENT_MATCHED',
            ...(amountForRow ? { amount: amountForRow } : {}),
            currencyCode: 'CNY',
            actorUserId: input.actorUserId,
            details: {
              importId: importRecord.id,
              wechatTransactionRef: ref
            }
          });
        } else {
          exceptionCount += 1;
          await repository.createLedgerEntry({
            ...(linkedInvoiceId ? { invoiceId: linkedInvoiceId } : {}),
            ...(matchedPaymentId ? { paymentId: matchedPaymentId } : {}),
            settlementRowId: settlementRow.id,
            entryType: status === 'UNMATCHED' ? 'SETTLEMENT_UNMATCHED' : 'SETTLEMENT_EXCEPTION',
            ...(amountForRow ? { amount: amountForRow } : {}),
            currencyCode: 'CNY',
            actorUserId: input.actorUserId,
            details: {
              importId: importRecord.id,
              wechatTransactionRef: ref,
              status,
              exceptionReason
            }
          });
        }
      }

      const finalized = await repository.updateSettlementImportCounts({
        importId: importRecord.id,
          rowCount: parsedRows.length - 1,
          matchedCount,
          exceptionCount
        });

      await audit.write({
        actorUserId: input.actorUserId,
        eventType: 'FINANCE_SETTLEMENT_IMPORT',
        entityType: 'finance_settlement_import',
        entityId: finalized.id,
        outcome: 'success',
        details: {
          sourceLabel,
          rowCount: finalized.rowCount,
          matchedCount: finalized.matchedCount,
          exceptionCount: finalized.exceptionCount
        },
        ...toMeta(input.meta)
      });

      return {
        import: finalized,
        rows: settlementRows
      };
    },

    async getReconciliationQueue() {
      const [unsettledPayments, exceptionRows, resolvedExceptionRows, unsettledInvoices, exceptionInvoices] = await Promise.all([
        repository.listUnsettledPayments(),
        repository.listSettlementExceptionRows(),
        repository.listResolvedSettlementExceptionRows(),
        repository.listInvoices({ statuses: ['ISSUED', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'] }),
        repository.listInvoices({ hasOpenException: true })
      ]);

      return {
        unsettledInvoices,
        exceptionInvoices,
        unsettledPayments,
        exceptionRows,
        resolvedExceptionRows
      };
    },

    async resolveSettlementException(input: {
      actorUserId: string;
      settlementRowId: number;
      resolutionNote: string;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      return resolveExceptionLifecycle({
        actorUserId: input.actorUserId,
        settlementRowId: input.settlementRowId,
        resolutionStatus: 'RESOLVED',
        resolutionNote: input.resolutionNote,
        meta: input.meta
      });
    },

    async closeSettlementException(input: {
      actorUserId: string;
      settlementRowId: number;
      resolutionNote: string;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      return resolveExceptionLifecycle({
        actorUserId: input.actorUserId,
        settlementRowId: input.settlementRowId,
        resolutionStatus: 'CLOSED',
        resolutionNote: input.resolutionNote,
        meta: input.meta
      });
    },

    async listLedgerEntries(invoiceId?: string) {
      return repository.listLedgerEntries(invoiceId);
    }
  };
};
