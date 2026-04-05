import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { requireAuthenticated, requireRoles } from '../access-control/guards.js';
import { HttpError } from '../../lib/http-error.js';

const toMeta = (request: FastifyRequest) => {
  const userAgentHeader = request.headers['user-agent'];
  const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

  return {
    requestId: request.id,
    ip: request.ip,
    ...(userAgent ? { userAgent } : {})
  };
};

export const policyRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [requireAuthenticated(app)] }, async (request) => {
    const includeInactive = request.auth?.roles.includes('administrator') ?? false;
    const policies = await app.researcherRepository.listPolicies(includeInactive);
    return { policies };
  });

  app.get('/:policyId', { preHandler: [requireAuthenticated(app)] }, async (request) => {
    const policyId = String((request.params as { policyId: string }).policyId);
    const policy = await app.researcherRepository.getPolicyById(policyId);

    if (!policy) {
      throw new HttpError(404, 'POLICY_NOT_FOUND', 'Funding policy was not found.');
    }

    if (!policy.isActive && !request.auth?.roles.includes('administrator')) {
      throw new HttpError(404, 'POLICY_NOT_FOUND', 'Funding policy was not found.');
    }

    return { policy };
  });

  app.post(
    '/',
    {
      preHandler: [requireAuthenticated(app), requireRoles(app, ['administrator'])],
      schema: {
        body: {
          type: 'object',
          required: ['title', 'periodStart', 'periodEnd', 'submissionDeadlineAt', 'graceHours', 'annualCapAmount', 'templates'],
          additionalProperties: false,
          properties: {
            title: { type: 'string', minLength: 3, maxLength: 150 },
            description: { type: 'string', maxLength: 2000 },
            periodStart: { type: 'string', format: 'date' },
            periodEnd: { type: 'string', format: 'date' },
            submissionDeadlineAt: { type: 'string', format: 'date-time' },
            graceHours: { type: 'integer', minimum: 0, maximum: 168 },
            annualCapAmount: { type: 'string', pattern: '^\\d+(?:\\.\\d{1,2})?$' },
            approvalLevelsRequired: { type: 'integer', minimum: 1, maximum: 3, default: 1 },
            isActive: { type: 'boolean' },
            templates: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['templateKey', 'label', 'isRequired'],
                additionalProperties: false,
                properties: {
                  templateKey: { type: 'string', minLength: 1, maxLength: 80 },
                  label: { type: 'string', minLength: 1, maxLength: 180 },
                  instructions: { type: 'string', maxLength: 2000 },
                  isRequired: { type: 'boolean' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const body = request.body as {
        title: string;
        description?: string;
        periodStart: string;
        periodEnd: string;
        submissionDeadlineAt: string;
        graceHours: number;
        annualCapAmount: string;
        approvalLevelsRequired?: number;
        isActive?: boolean;
        templates: Array<{ templateKey: string; label: string; instructions?: string; isRequired: boolean }>;
      };

      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const created = await app.researcherRepository.createPolicy({
        title: body.title,
        ...(body.description ? { description: body.description } : {}),
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
        submissionDeadlineAt: body.submissionDeadlineAt,
        graceHours: body.graceHours,
        annualCapAmount: body.annualCapAmount,
        approvalLevelsRequired: body.approvalLevelsRequired ?? 1,
        isActive: body.isActive ?? true,
        createdByUserId: actor.userId,
        templates: body.templates
      });

      await app.audit.write({
        actorUserId: actor.userId,
        eventType: 'POLICY_CREATED',
        entityType: 'funding_policy',
        entityId: created.id,
        outcome: 'success',
        details: {
          title: created.title
        },
        ...toMeta(request)
      });

      return reply.code(201).send({ policy: created });
    }
  );

  app.patch(
    '/:policyId',
    {
      preHandler: [requireAuthenticated(app), requireRoles(app, ['administrator'])],
      schema: {
        body: {
          type: 'object',
          required: ['title', 'periodStart', 'periodEnd', 'submissionDeadlineAt', 'graceHours', 'annualCapAmount', 'templates'],
          additionalProperties: false,
          properties: {
            title: { type: 'string', minLength: 3, maxLength: 150 },
            description: { type: 'string', maxLength: 2000 },
            periodStart: { type: 'string', format: 'date' },
            periodEnd: { type: 'string', format: 'date' },
            submissionDeadlineAt: { type: 'string', format: 'date-time' },
            graceHours: { type: 'integer', minimum: 0, maximum: 168 },
            annualCapAmount: { type: 'string', pattern: '^\\d+(?:\\.\\d{1,2})?$' },
            approvalLevelsRequired: { type: 'integer', minimum: 1, maximum: 3, default: 1 },
            isActive: { type: 'boolean' },
            templates: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['templateKey', 'label', 'isRequired'],
                additionalProperties: false,
                properties: {
                  templateKey: { type: 'string', minLength: 1, maxLength: 80 },
                  label: { type: 'string', minLength: 1, maxLength: 180 },
                  instructions: { type: 'string', maxLength: 2000 },
                  isRequired: { type: 'boolean' }
                }
              }
            }
          }
        }
      }
    },
    async (request) => {
      const policyId = String((request.params as { policyId: string }).policyId);
      const body = request.body as {
        title: string;
        description?: string;
        periodStart: string;
        periodEnd: string;
        submissionDeadlineAt: string;
        graceHours: number;
        annualCapAmount: string;
        approvalLevelsRequired?: number;
        isActive: boolean;
        templates: Array<{ templateKey: string; label: string; instructions?: string; isRequired: boolean }>;
      };

      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const updated = await app.researcherRepository.updatePolicy(policyId, {
        title: body.title,
        ...(body.description ? { description: body.description } : {}),
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
        submissionDeadlineAt: body.submissionDeadlineAt,
        graceHours: body.graceHours,
        annualCapAmount: body.annualCapAmount,
        approvalLevelsRequired: body.approvalLevelsRequired ?? 1,
        isActive: body.isActive,
        templates: body.templates
      });

      if (!updated) {
        throw new HttpError(404, 'POLICY_NOT_FOUND', 'Funding policy was not found.');
      }

      await app.audit.write({
        actorUserId: actor.userId,
        eventType: 'POLICY_UPDATED',
        entityType: 'funding_policy',
        entityId: updated.id,
        outcome: 'success',
        details: {
          title: updated.title
        },
        ...toMeta(request)
      });

      return { policy: updated };
    }
  );

  app.delete('/:policyId', { preHandler: [requireAuthenticated(app), requireRoles(app, ['administrator'])] }, async (request) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const policyId = String((request.params as { policyId: string }).policyId);

    const usage = await app.dbPool.query<{ total: string }>('SELECT COUNT(*)::text AS total FROM applications WHERE policy_id = $1', [policyId]);
    const linkedApplications = Number(usage.rows[0]?.total ?? '0');

    if (linkedApplications > 0) {
      throw new HttpError(409, 'POLICY_DELETE_BLOCKED', 'Cannot delete policy with existing applications.');
    }

    const deleted = await app.dbPool.query<Record<string, unknown>>('DELETE FROM funding_policies WHERE id = $1 RETURNING id, title', [policyId]);
    const row = deleted.rows[0];
    if (!row) {
      throw new HttpError(404, 'POLICY_NOT_FOUND', 'Funding policy was not found.');
    }

    await app.audit.write({
      actorUserId: actor.userId,
      eventType: 'POLICY_DELETED',
      entityType: 'funding_policy',
      entityId: String(row.id),
      outcome: 'success',
      details: {
        title: String(row.title)
      },
      ...toMeta(request)
    });

    return {
      ok: true,
      policyId: String(row.id)
    };
  });
};
