export const invoiceStatusTone = (status: string): 'warn' | 'ok' | 'bad' | 'neutral' => {
  if (status === 'PAID' || status === 'REFUNDED') {
    return 'ok';
  }

  if (status === 'PARTIALLY_PAID' || status === 'PARTIALLY_REFUNDED') {
    return 'warn';
  }

  if (status === 'ISSUED') {
    return 'neutral';
  }

  return 'bad';
};

export const settlementRowLabel = (status: string): string => {
  if (status === 'MATCHED') return 'Matched';
  if (status === 'UNMATCHED') return 'Unmatched reference';
  if (status === 'AMOUNT_MISMATCH') return 'Amount mismatch';
  if (status === 'DUPLICATE_REF') return 'Duplicate reference';
  if (status === 'INVALID_ROW') return 'Invalid row';
  return status;
};

export const refundMethodNeedsBank = (method: string): boolean => method === 'BANK_TRANSFER';
