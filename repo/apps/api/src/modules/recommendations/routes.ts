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

export const recommendationsRoutes: FastifyPluginAsync = async (app) => {
  const researcherOnly = [requireAuthenticated(app), requireRoles(app, ['researcher'])];

  app.get('/researcher', { preHandler: researcherOnly }, async (request) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    return app.recommendationsService.listResearcherRecommendations(actor.userId);
  });

  app.get('/researcher/preferences', { preHandler: researcherOnly }, async (request) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const preferences = await app.recommendationsService.getResearcherPreferences(actor.userId);
    return { preferences };
  });

  app.put(
    '/researcher/preferences',
    {
      preHandler: researcherOnly,
      schema: {
        body: {
          type: 'object',
          required: ['preferredDisciplines', 'preferredKeywords', 'preferredPublishers', 'preferredResourceTypes', 'preferredLocations'],
          additionalProperties: false,
          properties: {
            preferredDisciplines: { type: 'array', items: { type: 'string', maxLength: 120 } },
            preferredKeywords: { type: 'array', items: { type: 'string', maxLength: 120 } },
            preferredPublishers: { type: 'array', items: { type: 'string', maxLength: 240 } },
            preferredResourceTypes: { type: 'array', items: { type: 'string', enum: ['ROOM', 'EQUIPMENT', 'CONSULTATION'] } },
            preferredLocations: { type: 'array', items: { type: 'string', maxLength: 180 } }
          }
        }
      }
    },
    async (request) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const body = request.body as {
        preferredDisciplines: string[];
        preferredKeywords: string[];
        preferredPublishers: string[];
        preferredResourceTypes: string[];
        preferredLocations: string[];
      };

      const preferences = await app.recommendationsService.updateResearcherPreferences({
        userId: actor.userId,
        preferredDisciplines: body.preferredDisciplines,
        preferredKeywords: body.preferredKeywords,
        preferredPublishers: body.preferredPublishers,
        preferredResourceTypes: body.preferredResourceTypes,
        preferredLocations: body.preferredLocations,
        meta: toMeta(request)
      });

      return { preferences };
    }
  );

  app.get('/researcher/feedback', { preHandler: researcherOnly }, async (request) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const feedback = await app.recommendationsService.listResearcherFeedback(actor.userId);
    return { feedback };
  });

  app.post(
    '/researcher/feedback',
    {
      preHandler: researcherOnly,
      schema: {
        body: {
          type: 'object',
          required: ['targetType', 'targetId', 'action'],
          additionalProperties: false,
          properties: {
            targetType: { type: 'string', enum: ['JOURNAL', 'FUNDING_PROGRAM', 'RESOURCE'] },
            targetId: { type: 'string', format: 'uuid' },
            action: { type: 'string', enum: ['LIKE', 'NOT_INTERESTED', 'BLOCK'] }
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
        targetType: string;
        targetId: string;
        action: string;
      };

      const feedback = await app.recommendationsService.setResearcherFeedback({
        userId: actor.userId,
        targetType: body.targetType,
        targetId: body.targetId,
        action: body.action,
        meta: toMeta(request)
      });

      return reply.code(201).send({ feedback });
    }
  );
};
