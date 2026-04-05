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

const toBoolean = (value: unknown, defaultValue: boolean): boolean => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return String(value) === 'true';
};

export const resourceBookingRoutes: FastifyPluginAsync = async (app) => {
  const managerOnly = [requireAuthenticated(app), requireRoles(app, ['resource_manager'])];
  const researcherOnly = [requireAuthenticated(app), requireRoles(app, ['researcher'])];

  app.get('/manager/resources', { preHandler: managerOnly }, async (request) => {
    const includeInactive = toBoolean((request.query as { includeInactive?: string }).includeInactive, true);
    const resources = await app.resourceBookingService.listManagerResources(includeInactive);
    return { resources };
  });

  app.post(
    '/manager/resources',
    {
      preHandler: managerOnly,
      schema: {
        body: {
          type: 'object',
          required: ['resourceType', 'name', 'capacity', 'isActive'],
          additionalProperties: false,
          properties: {
            resourceType: { type: 'string', enum: ['ROOM', 'EQUIPMENT', 'CONSULTATION'] },
            name: { type: 'string', minLength: 2, maxLength: 180 },
            description: { type: 'string', maxLength: 2000 },
            location: { type: 'string', maxLength: 300 },
            capacity: { type: 'integer', minimum: 1 },
            timezone: { type: 'string', minLength: 2, maxLength: 120 },
            isActive: { type: 'boolean' }
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
        resourceType: string;
        name: string;
        description?: string;
        location?: string;
        capacity: number;
        timezone?: string;
        isActive: boolean;
      };

      const resource = await app.resourceBookingService.createResource({
        actorUserId: actor.userId,
        resourceType: body.resourceType,
        name: body.name,
        ...(body.description ? { description: body.description } : {}),
        ...(body.location ? { location: body.location } : {}),
        capacity: body.capacity,
        ...(body.timezone ? { timezone: body.timezone } : {}),
        isActive: body.isActive,
        meta: toMeta(request)
      });

      return reply.code(201).send({ resource });
    }
  );

  app.get('/manager/resources/:resourceId', { preHandler: managerOnly }, async (request) => {
    const resourceId = String((request.params as { resourceId: string }).resourceId);
    return app.resourceBookingService.getManagerResourceDetail(resourceId);
  });

  app.patch(
    '/manager/resources/:resourceId',
    {
      preHandler: managerOnly,
      schema: {
        body: {
          type: 'object',
          required: ['name', 'capacity', 'isActive'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 180 },
            description: { type: 'string', maxLength: 2000 },
            location: { type: 'string', maxLength: 300 },
            capacity: { type: 'integer', minimum: 1 },
            timezone: { type: 'string', minLength: 2, maxLength: 120 },
            isActive: { type: 'boolean' }
          }
        }
      }
    },
    async (request) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const resourceId = String((request.params as { resourceId: string }).resourceId);
      const body = request.body as {
        name: string;
        description?: string;
        location?: string;
        capacity: number;
        timezone?: string;
        isActive: boolean;
      };

      const resource = await app.resourceBookingService.updateResource({
        actorUserId: actor.userId,
        resourceId,
        name: body.name,
        ...(body.description ? { description: body.description } : {}),
        ...(body.location ? { location: body.location } : {}),
        capacity: body.capacity,
        ...(body.timezone ? { timezone: body.timezone } : {}),
        isActive: body.isActive,
        meta: toMeta(request)
      });

      return { resource };
    }
  );

  app.put(
    '/manager/resources/:resourceId/business-hours',
    {
      preHandler: managerOnly,
      schema: {
        body: {
          type: 'object',
          required: ['hours'],
          additionalProperties: false,
          properties: {
            hours: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['dayOfWeek', 'opensAt', 'closesAt'],
                additionalProperties: false,
                properties: {
                  dayOfWeek: { type: 'integer', minimum: 1, maximum: 7 },
                  opensAt: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
                  closesAt: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' }
                }
              }
            }
          }
        }
      }
    },
    async (request) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const resourceId = String((request.params as { resourceId: string }).resourceId);
      const body = request.body as {
        hours: Array<{ dayOfWeek: number; opensAt: string; closesAt: string }>;
      };

      const businessHours = await app.resourceBookingService.setBusinessHours({
        actorUserId: actor.userId,
        resourceId,
        hours: body.hours,
        meta: toMeta(request)
      });

      return { businessHours };
    }
  );

  app.post(
    '/manager/resources/:resourceId/blackouts',
    {
      preHandler: managerOnly,
      schema: {
        body: {
          type: 'object',
          required: ['startsAt', 'endsAt', 'reason'],
          additionalProperties: false,
          properties: {
            startsAt: { type: 'string', minLength: 10, maxLength: 64 },
            endsAt: { type: 'string', minLength: 10, maxLength: 64 },
            reason: { type: 'string', minLength: 3, maxLength: 400 }
          }
        }
      }
    },
    async (request, reply) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const resourceId = String((request.params as { resourceId: string }).resourceId);
      const body = request.body as {
        startsAt: string;
        endsAt: string;
        reason: string;
      };

      const blackout = await app.resourceBookingService.addBlackoutWindow({
        actorUserId: actor.userId,
        resourceId,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        reason: body.reason,
        meta: toMeta(request)
      });

      return reply.code(201).send({ blackout });
    }
  );

  app.get(
    '/researcher/availability',
    {
      preHandler: researcherOnly,
      schema: {
        querystring: {
          type: 'object',
          required: ['startsAt', 'endsAt'],
          additionalProperties: false,
          properties: {
            startsAt: { type: 'string', minLength: 10, maxLength: 64 },
            endsAt: { type: 'string', minLength: 10, maxLength: 64 }
          }
        }
      }
    },
    async (request) => {
      const query = request.query as { startsAt: string; endsAt: string };
      const resources = await app.resourceBookingService.listResearcherAvailability({
        startsAt: query.startsAt,
        endsAt: query.endsAt
      });
      return { resources };
    }
  );

  app.get('/researcher/bookings', { preHandler: researcherOnly }, async (request) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const bookings = await app.resourceBookingService.listResearcherBookings(actor.userId);
    return { bookings };
  });

  app.post(
    '/researcher/bookings',
    {
      preHandler: researcherOnly,
      schema: {
        body: {
          type: 'object',
          required: ['resourceId', 'startsAt', 'endsAt', 'seatsRequested'],
          additionalProperties: false,
          properties: {
            resourceId: { type: 'string', format: 'uuid' },
            startsAt: { type: 'string', minLength: 10, maxLength: 64 },
            endsAt: { type: 'string', minLength: 10, maxLength: 64 },
            seatsRequested: { type: 'integer', minimum: 1 }
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
        resourceId: string;
        startsAt: string;
        endsAt: string;
        seatsRequested: number;
      };

      const booking = await app.resourceBookingService.createResearcherBooking({
        researcherUserId: actor.userId,
        resourceId: body.resourceId,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        seatsRequested: body.seatsRequested,
        meta: toMeta(request)
      });

      return reply.code(201).send({ booking });
    }
  );
};
