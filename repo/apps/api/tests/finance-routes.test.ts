import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { financeRoutes } from '../src/modules/finance/routes.js';
import { registerErrorEnvelope } from '../src/plugins/error-envelope.js';

describe('finance routes RBAC boundaries', () => {
  const apps: Array<Awaited<ReturnType<typeof buildTestApp>>> = [];

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop();
      if (app) {
        await app.close();
      }
    }
  });

  const buildTestApp = async () => {
    const app = Fastify({ logger: false });

    app.decorate('audit', { write: vi.fn(async () => undefined) });

    const financeService = {
      listInvoices: vi.fn(async () => []),
      createInvoice: vi.fn(async () => ({ id: 'invoice-1' })),
      getInvoiceDetail: vi.fn(async () => ({ invoice: { id: 'invoice-1' }, payments: [], refunds: [], ledger: [] })),
      recordPayment: vi.fn(async () => ({ invoice: { id: 'invoice-1' }, payment: { id: 'payment-1' } })),
      recordRefund: vi.fn(async () => ({ invoice: { id: 'invoice-1' }, refund: { id: 'refund-1' } })),
      importSettlementCsv: vi.fn(async () => ({ import: { id: 'import-1' }, rows: [] })),
      getReconciliationQueue: vi.fn(async () => ({ unsettledInvoices: [], exceptionInvoices: [], unsettledPayments: [], exceptionRows: [] })),
      resolveSettlementException: vi.fn(async () => ({ id: 1, resolutionStatus: 'RESOLVED' })),
      closeSettlementException: vi.fn(async () => ({ id: 1, resolutionStatus: 'CLOSED' })),
      listLedgerEntries: vi.fn(async () => [])
    };

    app.decorate('financeService', financeService);

    app.addHook('onRequest', async (request) => {
      const userId = request.headers['x-test-user-id'];
      const roles = String(request.headers['x-test-roles'] ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

      if (!userId || roles.length === 0) {
        request.auth = null;
        return;
      }

      request.auth = {
        userId: String(userId),
        username: 'tester',
        roles: roles as never,
        sessionId: 'session-1'
      };
    });

    await app.register(financeRoutes, { prefix: '/finance' });
    registerErrorEnvelope(app);

    apps.push(app);
    return { app, financeService };
  };

  it('returns 401 for unauthenticated finance invoices request', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/finance/invoices' });
    expect(response.statusCode).toBe(401);
  });

  it('returns 403 for non-finance role access to finance endpoints', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/finance/invoices',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-roles': 'researcher',
        'content-type': 'application/json'
      },
      payload: {
        serviceType: 'OTHER',
        description: 'Invoice',
        totalAmount: '10.00'
      }
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows finance_clerk role to create invoices, run reconciliation import, and read queue/ledger', async () => {
    const { app, financeService } = await buildTestApp();

    const createResponse = await app.inject({
      method: 'POST',
      url: '/finance/invoices',
      headers: {
        'x-test-user-id': 'clerk-1',
        'x-test-roles': 'finance_clerk',
        'content-type': 'application/json'
      },
      payload: {
        serviceType: 'OTHER',
        description: 'Invoice',
        totalAmount: '10.00'
      }
    });

    const importResponse = await app.inject({
      method: 'POST',
      url: '/finance/reconciliation/import-csv',
      headers: {
        'x-test-user-id': 'clerk-1',
        'x-test-roles': 'finance_clerk',
        'content-type': 'application/json'
      },
      payload: {
        sourceLabel: 'daily.csv',
        csvText: 'wechatTransactionRef,amount,settledAt\nabc,10.00,2026-03-01T00:00:00.000Z'
      }
    });

    const queueResponse = await app.inject({
      method: 'GET',
      url: '/finance/reconciliation/queue',
      headers: {
        'x-test-user-id': 'clerk-1',
        'x-test-roles': 'finance_clerk'
      }
    });

    const ledgerResponse = await app.inject({
      method: 'GET',
      url: '/finance/ledger',
      headers: {
        'x-test-user-id': 'clerk-1',
        'x-test-roles': 'finance_clerk'
      }
    });

    const resolveResponse = await app.inject({
      method: 'POST',
      url: '/finance/reconciliation/exceptions/1/resolve',
      headers: {
        'x-test-user-id': 'clerk-1',
        'x-test-roles': 'finance_clerk',
        'content-type': 'application/json'
      },
      payload: {
        resolutionNote: 'Matched against corrected reference.'
      }
    });

    const closeResponse = await app.inject({
      method: 'POST',
      url: '/finance/reconciliation/exceptions/1/close',
      headers: {
        'x-test-user-id': 'clerk-1',
        'x-test-roles': 'finance_clerk',
        'content-type': 'application/json'
      },
      payload: {
        resolutionNote: 'Closed as non-actionable bank export row.'
      }
    });

    expect(createResponse.statusCode).toBe(201);
    expect(importResponse.statusCode).toBe(201);
    expect(queueResponse.statusCode).toBe(200);
    expect(ledgerResponse.statusCode).toBe(200);
    expect(resolveResponse.statusCode).toBe(200);
    expect(closeResponse.statusCode).toBe(200);
    expect(financeService.createInvoice).toHaveBeenCalled();
    expect(financeService.importSettlementCsv).toHaveBeenCalled();
    expect(financeService.getReconciliationQueue).toHaveBeenCalled();
    expect(financeService.resolveSettlementException).toHaveBeenCalled();
    expect(financeService.closeSettlementException).toHaveBeenCalled();
    expect(financeService.listLedgerEntries).toHaveBeenCalled();
  });
});
