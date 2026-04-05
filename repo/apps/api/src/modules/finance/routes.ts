import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { HttpError } from '../../lib/http-error.js';
import { requireAuthenticated, requireRoles } from '../access-control/guards.js';

const toMeta = (request: FastifyRequest) => {
  const userAgentHeader = request.headers['user-agent'];
  const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

  return {
    requestId: request.id,
    ip: request.ip,
    ...(userAgent ? { userAgent } : {})
  };
};

const toStatuses = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => String(entry).split(',').map((token) => token.trim()).filter(Boolean));
  }

  if (typeof value === 'string') {
    return value.split(',').map((token) => token.trim()).filter(Boolean);
  }

  return undefined;
};

const moneyPattern = '^\\d+(?:\\.\\d{1,2})?$';

export const financeRoutes: FastifyPluginAsync = async (app) => {
  const financeOnly = [requireAuthenticated(app), requireRoles(app, ['finance_clerk'])];

  app.get('/invoices', { preHandler: financeOnly }, async (request) => {
    const statuses = toStatuses((request.query as { statuses?: unknown }).statuses);
    const invoices = await app.financeService.listInvoices(statuses);
    return { invoices };
  });

  app.post(
    '/invoices',
    {
      preHandler: financeOnly,
      schema: {
        body: {
          type: 'object',
          required: ['serviceType', 'description', 'totalAmount'],
          additionalProperties: false,
          properties: {
            customerUserId: { type: 'string', format: 'uuid' },
            serviceType: { type: 'string', enum: ['RESOURCE_BOOKING', 'JOURNAL_SERVICE', 'OTHER'] },
            serviceReferenceId: { type: 'string', format: 'uuid' },
            description: { type: 'string', minLength: 2, maxLength: 500 },
            totalAmount: { type: 'string', pattern: moneyPattern, maxLength: 32 },
            dueAt: { type: 'string', minLength: 10, maxLength: 64 }
          }
        }
      }
    },
    async (request, reply) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const body = request.body as {
        customerUserId?: string;
        serviceType: 'RESOURCE_BOOKING' | 'JOURNAL_SERVICE' | 'OTHER';
        serviceReferenceId?: string;
        description: string;
        totalAmount: string;
        dueAt?: string;
      };

      const invoice = await app.financeService.createInvoice({
        actorUserId: actor.userId,
        ...(body.customerUserId ? { customerUserId: body.customerUserId } : {}),
        serviceType: body.serviceType,
        ...(body.serviceReferenceId ? { serviceReferenceId: body.serviceReferenceId } : {}),
        description: body.description,
        totalAmount: body.totalAmount,
        ...(body.dueAt ? { dueAt: body.dueAt } : {}),
        meta: toMeta(request)
      });

      return reply.code(201).send({ invoice });
    }
  );

  app.get('/invoices/:invoiceId', { preHandler: financeOnly }, async (request) => {
    const invoiceId = String((request.params as { invoiceId: string }).invoiceId);
    return app.financeService.getInvoiceDetail(invoiceId);
  });

  app.post(
    '/invoices/:invoiceId/payments',
    {
      preHandler: financeOnly,
      schema: {
        body: {
          type: 'object',
          required: ['amount', 'wechatTransactionRef', 'receivedAt'],
          additionalProperties: false,
          properties: {
            amount: { type: 'string', pattern: moneyPattern, maxLength: 32 },
            wechatTransactionRef: { type: 'string', minLength: 3, maxLength: 180 },
            receivedAt: { type: 'string', minLength: 10, maxLength: 64 },
            note: { type: 'string', maxLength: 800 }
          }
        }
      }
    },
    async (request, reply) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const invoiceId = String((request.params as { invoiceId: string }).invoiceId);
      const body = request.body as {
        amount: string;
        wechatTransactionRef: string;
        receivedAt: string;
        note?: string;
      };

      const result = await app.financeService.recordPayment({
        actorUserId: actor.userId,
        invoiceId,
        amount: body.amount,
        wechatTransactionRef: body.wechatTransactionRef,
        receivedAt: body.receivedAt,
        ...(body.note ? { note: body.note } : {}),
        meta: toMeta(request)
      });

      return reply.code(201).send(result);
    }
  );

  app.post(
    '/invoices/:invoiceId/refunds',
    {
      preHandler: financeOnly,
      schema: {
        body: {
          type: 'object',
          required: ['amount', 'refundMethod', 'reason', 'refundedAt'],
          additionalProperties: false,
          properties: {
            paymentId: { type: 'string', format: 'uuid' },
            amount: { type: 'string', pattern: moneyPattern, maxLength: 32 },
            refundMethod: { type: 'string', enum: ['WECHAT_OFFLINE', 'BANK_TRANSFER'] },
            reason: { type: 'string', minLength: 3, maxLength: 500 },
            refundedAt: { type: 'string', minLength: 10, maxLength: 64 },
            wechatRefundReference: { type: 'string', maxLength: 180 },
            bankAccountName: { type: 'string', maxLength: 240 },
            bankRoutingNumber: { type: 'string', maxLength: 120 },
            bankAccountNumber: { type: 'string', maxLength: 120 }
          }
        }
      }
    },
    async (request, reply) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const invoiceId = String((request.params as { invoiceId: string }).invoiceId);
      const body = request.body as {
        paymentId?: string;
        amount: string;
        refundMethod: 'WECHAT_OFFLINE' | 'BANK_TRANSFER';
        reason: string;
        refundedAt: string;
        wechatRefundReference?: string;
        bankAccountName?: string;
        bankRoutingNumber?: string;
        bankAccountNumber?: string;
      };

      const result = await app.financeService.recordRefund({
        actorUserId: actor.userId,
        invoiceId,
        ...(body.paymentId ? { paymentId: body.paymentId } : {}),
        amount: body.amount,
        refundMethod: body.refundMethod,
        reason: body.reason,
        refundedAt: body.refundedAt,
        ...(body.wechatRefundReference ? { wechatRefundReference: body.wechatRefundReference } : {}),
        ...(body.bankAccountName ? { bankAccountName: body.bankAccountName } : {}),
        ...(body.bankRoutingNumber ? { bankRoutingNumber: body.bankRoutingNumber } : {}),
        ...(body.bankAccountNumber ? { bankAccountNumber: body.bankAccountNumber } : {}),
        meta: toMeta(request)
      });

      return reply.code(201).send(result);
    }
  );

  app.post(
    '/reconciliation/import-csv',
    {
      preHandler: financeOnly,
      schema: {
        body: {
          type: 'object',
          required: ['csvText'],
          additionalProperties: false,
          properties: {
            sourceLabel: { type: 'string', maxLength: 200 },
            csvText: { type: 'string', minLength: 5, maxLength: 500000 }
          }
        }
      }
    },
    async (request, reply) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const body = request.body as {
        sourceLabel?: string;
        csvText: string;
      };

      const result = await app.financeService.importSettlementCsv({
        actorUserId: actor.userId,
        sourceLabel: body.sourceLabel ?? 'manual_csv_import',
        csvText: body.csvText,
        meta: toMeta(request)
      });

      return reply.code(201).send(result);
    }
  );

  app.get('/reconciliation/queue', { preHandler: financeOnly }, async () => {
    return app.financeService.getReconciliationQueue();
  });

  app.post(
    '/reconciliation/exceptions/:rowId/resolve',
    {
      preHandler: financeOnly,
      schema: {
        body: {
          type: 'object',
          required: ['resolutionNote'],
          additionalProperties: false,
          properties: {
            resolutionNote: { type: 'string', minLength: 3, maxLength: 2000 }
          }
        }
      }
    },
    async (request, reply) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const rowId = Number((request.params as { rowId: string }).rowId);
      if (!Number.isInteger(rowId) || rowId <= 0) {
        throw new HttpError(400, 'INVALID_SETTLEMENT_ROW_ID', 'Settlement row id must be a positive integer.');
      }

      const body = request.body as { resolutionNote: string };
      const row = await app.financeService.resolveSettlementException({
        actorUserId: actor.userId,
        settlementRowId: rowId,
        resolutionNote: body.resolutionNote,
        meta: toMeta(request)
      });

      return reply.code(200).send({ row });
    }
  );

  app.post(
    '/reconciliation/exceptions/:rowId/close',
    {
      preHandler: financeOnly,
      schema: {
        body: {
          type: 'object',
          required: ['resolutionNote'],
          additionalProperties: false,
          properties: {
            resolutionNote: { type: 'string', minLength: 3, maxLength: 2000 }
          }
        }
      }
    },
    async (request, reply) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const rowId = Number((request.params as { rowId: string }).rowId);
      if (!Number.isInteger(rowId) || rowId <= 0) {
        throw new HttpError(400, 'INVALID_SETTLEMENT_ROW_ID', 'Settlement row id must be a positive integer.');
      }

      const body = request.body as { resolutionNote: string };
      const row = await app.financeService.closeSettlementException({
        actorUserId: actor.userId,
        settlementRowId: rowId,
        resolutionNote: body.resolutionNote,
        meta: toMeta(request)
      });

      return reply.code(200).send({ row });
    }
  );

  app.get('/ledger', { preHandler: financeOnly }, async (request) => {
    const invoiceId = (request.query as { invoiceId?: string }).invoiceId;
    const entries = await app.financeService.listLedgerEntries(invoiceId);
    return { entries };
  });
};
