import { describe, expect, it } from 'vitest';
import { invoiceStatusTone, refundMethodNeedsBank, settlementRowLabel } from '../src/lib/finance-ui';

describe('finance UI helpers', () => {
  it('maps invoice statuses to explicit tones', () => {
    expect(invoiceStatusTone('PAID')).toBe('ok');
    expect(invoiceStatusTone('REFUNDED')).toBe('ok');
    expect(invoiceStatusTone('PARTIALLY_PAID')).toBe('warn');
    expect(invoiceStatusTone('PARTIALLY_REFUNDED')).toBe('warn');
    expect(invoiceStatusTone('ISSUED')).toBe('neutral');
  });

  it('returns readable settlement row labels', () => {
    expect(settlementRowLabel('UNMATCHED')).toBe('Unmatched reference');
    expect(settlementRowLabel('AMOUNT_MISMATCH')).toBe('Amount mismatch');
    expect(settlementRowLabel('DUPLICATE_REF')).toBe('Duplicate reference');
  });

  it('identifies bank-transfer refund method as bank-details required', () => {
    expect(refundMethodNeedsBank('BANK_TRANSFER')).toBe(true);
    expect(refundMethodNeedsBank('WECHAT_OFFLINE')).toBe(false);
  });
});
