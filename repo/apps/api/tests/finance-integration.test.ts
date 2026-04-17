import { afterEach, describe, expect, it } from 'vitest';
import { createIntegrationDatabase } from './helpers/db-integration.js';

describe('finance routes integration (true no-mock)', () => {
  const integrationTimeout = 30000;
  let context: Awaited<ReturnType<typeof createIntegrationDatabase>> | null = null;
  let app: Awaited<ReturnType<Awaited<ReturnType<typeof createIntegrationDatabase>>['buildApiApp']>> | null = null;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
    if (context) {
      await context.cleanup();
      context = null;
    }
  });

  const extractCookie = (header: string | string[] | undefined) =>
    String(Array.isArray(header) ? header[0] : header ?? '').split(';')[0] ?? '';

  const boot = async () => {
    context = await createIntegrationDatabase();
    app = await context.buildApiApp();

    await context.seedUser({ username: 'clerk1', password: 'ClerkPass1!', roles: ['finance_clerk'] });
    await context.seedUser({ username: 'researcher1', password: 'ResearcherPass1!', roles: ['researcher'] });

    const clerkLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'clerk1', password: 'ClerkPass1!' }
    });
    const researcherLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'researcher1', password: 'ResearcherPass1!' }
    });

    return {
      clerkCookie: extractCookie(clerkLogin.headers['set-cookie']),
      researcherCookie: extractCookie(researcherLogin.headers['set-cookie'])
    };
  };

  it('rejects unauthenticated GET /api/v1/finance/invoices', async () => {
    await boot();
    const response = await app!.inject({ method: 'GET', url: '/api/v1/finance/invoices' });
    expect(response.statusCode).toBe(401);
  }, integrationTimeout);

  it('returns 403 when researcher calls GET /api/v1/finance/invoices', async () => {
    const { researcherCookie } = await boot();
    const response = await app!.inject({
      method: 'GET',
      url: '/api/v1/finance/invoices',
      headers: { cookie: researcherCookie }
    });
    expect(response.statusCode).toBe(403);
  }, integrationTimeout);

  it('supports invoice lifecycle: POST/GET /api/v1/finance/invoices and GET /api/v1/finance/invoices/:id', async () => {
    const { clerkCookie } = await boot();

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/finance/invoices',
      headers: { 'content-type': 'application/json', cookie: clerkCookie },
      payload: {
        serviceType: 'OTHER',
        description: 'Consultation fee',
        totalAmount: '250.00'
      }
    });
    expect(createResponse.statusCode).toBe(201);
    const invoice = createResponse.json().invoice;
    expect(invoice.description).toBe('Consultation fee');
    expect(invoice.totalAmount).toBe('250.00');
    expect(invoice.status).toBe('ISSUED');
    const invoiceId = invoice.id as string;

    const listResponse = await app!.inject({
      method: 'GET',
      url: '/api/v1/finance/invoices',
      headers: { cookie: clerkCookie }
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().invoices.some((entry: { id: string }) => entry.id === invoiceId)).toBe(true);

    const detailResponse = await app!.inject({
      method: 'GET',
      url: `/api/v1/finance/invoices/${invoiceId}`,
      headers: { cookie: clerkCookie }
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json().invoice.id).toBe(invoiceId);
    expect(Array.isArray(detailResponse.json().payments)).toBe(true);
    expect(Array.isArray(detailResponse.json().refunds)).toBe(true);
    expect(Array.isArray(detailResponse.json().ledger)).toBe(true);
  }, integrationTimeout);

  it('records payments + refunds via POST /api/v1/finance/invoices/:id/payments and /refunds', async () => {
    const { clerkCookie } = await boot();

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/finance/invoices',
      headers: { 'content-type': 'application/json', cookie: clerkCookie },
      payload: {
        serviceType: 'OTHER',
        description: 'Service payment',
        totalAmount: '100.00'
      }
    });
    const invoiceId = createResponse.json().invoice.id as string;

    const paymentResponse = await app!.inject({
      method: 'POST',
      url: `/api/v1/finance/invoices/${invoiceId}/payments`,
      headers: { 'content-type': 'application/json', cookie: clerkCookie },
      payload: {
        amount: '100.00',
        wechatTransactionRef: 'WECHAT-TX-1',
        receivedAt: '2026-06-01T10:00:00.000Z',
        note: 'Paid in full'
      }
    });
    expect(paymentResponse.statusCode).toBe(201);
    expect(paymentResponse.json().payment.wechatTransactionRef).toBe('WECHAT-TX-1');
    expect(paymentResponse.json().invoice.status).toBe('PAID');

    const refundResponse = await app!.inject({
      method: 'POST',
      url: `/api/v1/finance/invoices/${invoiceId}/refunds`,
      headers: { 'content-type': 'application/json', cookie: clerkCookie },
      payload: {
        amount: '25.00',
        refundMethod: 'WECHAT_OFFLINE',
        reason: 'Partial cancellation',
        refundedAt: '2026-06-02T10:00:00.000Z',
        wechatRefundReference: 'WECHAT-REF-1'
      }
    });
    expect(refundResponse.statusCode).toBe(201);
    expect(refundResponse.json().refund.amount).toBe('25.00');
    expect(refundResponse.json().refund.refundMethod).toBe('WECHAT_OFFLINE');

    const ledgerResponse = await app!.inject({
      method: 'GET',
      url: `/api/v1/finance/ledger?invoiceId=${invoiceId}`,
      headers: { cookie: clerkCookie }
    });
    expect(ledgerResponse.statusCode).toBe(200);
    const entries = ledgerResponse.json().entries;
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(entries.some((entry: { entryType: string }) => entry.entryType === 'INVOICE_ISSUED')).toBe(true);
    expect(entries.some((entry: { entryType: string }) => entry.entryType === 'PAYMENT_RECORDED')).toBe(true);
    expect(entries.some((entry: { entryType: string }) => entry.entryType === 'REFUND_RECORDED')).toBe(true);
  }, integrationTimeout);

  it('imports settlement CSV and exposes queue + exception resolution via /api/v1/finance/reconciliation/*', async () => {
    const { clerkCookie } = await boot();

    const invoice = await app!.inject({
      method: 'POST',
      url: '/api/v1/finance/invoices',
      headers: { 'content-type': 'application/json', cookie: clerkCookie },
      payload: { serviceType: 'OTHER', description: 'CSV invoice', totalAmount: '50.00' }
    });
    const invoiceId = invoice.json().invoice.id as string;

    const paymentResponse = await app!.inject({
      method: 'POST',
      url: `/api/v1/finance/invoices/${invoiceId}/payments`,
      headers: { 'content-type': 'application/json', cookie: clerkCookie },
      payload: {
        amount: '50.00',
        wechatTransactionRef: 'CSV-REF-1',
        receivedAt: '2026-06-01T10:00:00.000Z'
      }
    });
    expect(paymentResponse.statusCode).toBe(201);

    const csvText = [
      'wechatTransactionRef,amount,settledAt',
      'CSV-REF-1,50.00,2026-06-02T10:00:00.000Z',
      'UNKNOWN-REF,75.00,2026-06-02T10:00:00.000Z'
    ].join('\n');

    const importResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/finance/reconciliation/import-csv',
      headers: { 'content-type': 'application/json', cookie: clerkCookie },
      payload: { sourceLabel: 'weekly-settlement', csvText }
    });
    expect(importResponse.statusCode).toBe(201);
    expect(importResponse.json().import.matchedCount).toBe(1);
    expect(importResponse.json().import.exceptionCount).toBe(1);
    const exceptionRow = importResponse.json().rows.find((entry: { status: string }) => entry.status === 'UNMATCHED');
    expect(exceptionRow).toBeDefined();
    const rowId = exceptionRow.id as number;

    const queueResponse = await app!.inject({
      method: 'GET',
      url: '/api/v1/finance/reconciliation/queue',
      headers: { cookie: clerkCookie }
    });
    expect(queueResponse.statusCode).toBe(200);
    const queueBody = queueResponse.json();
    expect(Array.isArray(queueBody.exceptionRows)).toBe(true);

    const resolveResponse = await app!.inject({
      method: 'POST',
      url: `/api/v1/finance/reconciliation/exceptions/${rowId}/resolve`,
      headers: { 'content-type': 'application/json', cookie: clerkCookie },
      payload: { resolutionNote: 'Manually matched to invoice INV-CSV' }
    });
    expect(resolveResponse.statusCode).toBe(200);
    expect(resolveResponse.json().row.id).toBe(rowId);

    const closeResponse = await app!.inject({
      method: 'POST',
      url: `/api/v1/finance/reconciliation/exceptions/${rowId}/close`,
      headers: { 'content-type': 'application/json', cookie: clerkCookie },
      payload: { resolutionNote: 'Closed after review' }
    });
    expect(closeResponse.statusCode).toBe(200);
    expect(closeResponse.json().row.id).toBe(rowId);
  }, integrationTimeout);

  it('returns 400 for invalid decimal payment amount on POST /api/v1/finance/invoices/:id/payments', async () => {
    const { clerkCookie } = await boot();

    const created = await app!.inject({
      method: 'POST',
      url: '/api/v1/finance/invoices',
      headers: { 'content-type': 'application/json', cookie: clerkCookie },
      payload: { serviceType: 'OTHER', description: 'Test', totalAmount: '10.00' }
    });
    const invoiceId = created.json().invoice.id as string;

    const response = await app!.inject({
      method: 'POST',
      url: `/api/v1/finance/invoices/${invoiceId}/payments`,
      headers: { 'content-type': 'application/json', cookie: clerkCookie },
      payload: {
        amount: 'not-a-number',
        wechatTransactionRef: 'REF-X',
        receivedAt: '2026-06-01T10:00:00.000Z'
      }
    });
    expect(response.statusCode).toBe(400);
  }, integrationTimeout);

  it('lists ledger via GET /api/v1/finance/ledger without invoice filter', async () => {
    const { clerkCookie } = await boot();
    await app!.inject({
      method: 'POST',
      url: '/api/v1/finance/invoices',
      headers: { 'content-type': 'application/json', cookie: clerkCookie },
      payload: { serviceType: 'OTHER', description: 'Ledger test', totalAmount: '10.00' }
    });

    const response = await app!.inject({
      method: 'GET',
      url: '/api/v1/finance/ledger',
      headers: { cookie: clerkCookie }
    });
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json().entries)).toBe(true);
    expect(response.json().entries.length).toBeGreaterThan(0);
  }, integrationTimeout);
});
