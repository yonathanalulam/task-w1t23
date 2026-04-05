export const invoiceStatuses = ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

export const invoiceServiceTypes = ['RESOURCE_BOOKING', 'JOURNAL_SERVICE', 'OTHER'] as const;
export type InvoiceServiceType = (typeof invoiceServiceTypes)[number];

export const paymentMethods = ['WECHAT_OFFLINE'] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const refundMethods = ['WECHAT_OFFLINE', 'BANK_TRANSFER'] as const;
export type RefundMethod = (typeof refundMethods)[number];

export const settlementStatuses = ['UNSETTLED', 'MATCHED', 'EXCEPTION'] as const;
export type SettlementStatus = (typeof settlementStatuses)[number];

export const settlementRowStatuses = ['MATCHED', 'UNMATCHED', 'AMOUNT_MISMATCH', 'DUPLICATE_REF', 'INVALID_ROW'] as const;
export type SettlementRowStatus = (typeof settlementRowStatuses)[number];

export const ledgerEntryTypes = [
  'INVOICE_ISSUED',
  'PAYMENT_RECORDED',
  'REFUND_RECORDED',
  'SETTLEMENT_MATCHED',
  'SETTLEMENT_EXCEPTION',
  'SETTLEMENT_UNMATCHED',
  'SETTLEMENT_EXCEPTION_RESOLVED',
  'SETTLEMENT_EXCEPTION_CLOSED'
] as const;
export type LedgerEntryType = (typeof ledgerEntryTypes)[number];

export const settlementExceptionResolutionStatuses = ['OPEN', 'RESOLVED', 'CLOSED'] as const;
export type SettlementExceptionResolutionStatus = (typeof settlementExceptionResolutionStatuses)[number];

export interface FinanceInvoiceRecord {
  id: string;
  invoiceNumber: string;
  customerUserId: string | null;
  serviceType: InvoiceServiceType;
  serviceReferenceId: string | null;
  description: string;
  currencyCode: string;
  totalAmount: string;
  paidAmount: string;
  refundedAmount: string;
  hasOpenException: boolean;
  status: InvoiceStatus;
  dueAt: Date | null;
  issuedByUserId: string;
  issuedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface FinancePaymentRecord {
  id: string;
  invoiceId: string;
  paymentMethod: PaymentMethod;
  wechatTransactionRef: string;
  amount: string;
  receivedAt: Date;
  settlementStatus: SettlementStatus;
  settlementImportId: string | null;
  recordedByUserId: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FinanceRefundRecord {
  id: string;
  invoiceId: string;
  paymentId: string | null;
  amount: string;
  refundMethod: RefundMethod;
  reason: string;
  wechatRefundReference: string | null;
  bankAccountName: string | null;
  bankRoutingNumberEncrypted: string | null;
  bankAccountNumberEncrypted: string | null;
  bankAccountLast4: string | null;
  recordedByUserId: string;
  refundedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface FinanceSettlementImportRecord {
  id: string;
  sourceLabel: string;
  importedByUserId: string;
  rowCount: number;
  matchedCount: number;
  exceptionCount: number;
  createdAt: Date;
}

export interface FinanceSettlementRowRecord {
  id: number;
  importId: string;
  rowNumber: number;
  wechatTransactionRef: string | null;
  amount: string | null;
  settledAt: Date | null;
  status: SettlementRowStatus;
  exceptionReason: string | null;
  resolutionStatus: SettlementExceptionResolutionStatus;
  resolutionNote: string | null;
  resolvedByUserId: string | null;
  resolvedAt: Date | null;
  matchedPaymentId: string | null;
  rawRow: Record<string, unknown>;
  createdAt: Date;
}

export interface FinanceSettlementExceptionRecord extends FinanceSettlementRowRecord {
  matchedInvoiceId: string | null;
  matchedInvoiceNumber: string | null;
}

export interface FinanceLedgerEntryRecord {
  id: number;
  invoiceId: string | null;
  paymentId: string | null;
  refundId: string | null;
  settlementRowId: number | null;
  entryType: LedgerEntryType;
  amount: string | null;
  currencyCode: string;
  actorUserId: string;
  actorUsername: string | null;
  details: Record<string, unknown>;
  createdAt: Date;
}
