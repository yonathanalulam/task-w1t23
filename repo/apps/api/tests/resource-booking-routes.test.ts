import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resourceBookingRoutes } from '../src/modules/resource-booking/routes.js';
import { registerErrorEnvelope } from '../src/plugins/error-envelope.js';

describe('resource booking routes RBAC boundaries', () => {
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

    app.decorate('audit', {
      write: vi.fn(async () => undefined)
    });

    const resourceBookingService = {
      listManagerResources: vi.fn(async () => []),
      createResource: vi.fn(async () => ({ id: 'resource-1' })),
      getManagerResourceDetail: vi.fn(async () => ({ resource: { id: 'resource-1' }, businessHours: [], blackouts: [] })),
      updateResource: vi.fn(async () => ({ id: 'resource-1' })),
      setBusinessHours: vi.fn(async () => []),
      addBlackoutWindow: vi.fn(async () => ({ id: 'blackout-1' })),
      listResearcherAvailability: vi.fn(async () => []),
      listResearcherBookings: vi.fn(async () => []),
      createResearcherBooking: vi.fn(async () => ({ id: 'booking-1' }))
    };

    app.decorate('resourceBookingService', resourceBookingService);

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

    await app.register(resourceBookingRoutes, { prefix: '/resource-booking' });
    registerErrorEnvelope(app);

    apps.push(app);
    return { app, resourceBookingService };
  };

  it('returns 401 for unauthenticated manager resource list request', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/resource-booking/manager/resources' });
    expect(response.statusCode).toBe(401);
  });

  it('returns 403 when researcher role calls manager mutation endpoint', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/resource-booking/manager/resources',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-roles': 'researcher',
        'content-type': 'application/json'
      },
      payload: {
        resourceType: 'ROOM',
        name: 'Room A',
        capacity: 4,
        isActive: true
      }
    });
    expect(response.statusCode).toBe(403);
  });

  it('allows resource_manager role to list manager resources', async () => {
    const { app, resourceBookingService } = await buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/resource-booking/manager/resources',
      headers: {
        'x-test-user-id': 'manager-1',
        'x-test-roles': 'resource_manager'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(resourceBookingService.listManagerResources).toHaveBeenCalled();
  });

  it('returns 403 when manager role requests researcher booking availability', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/resource-booking/researcher/availability?startsAt=2026-06-01T10:00:00.000Z&endsAt=2026-06-01T11:00:00.000Z',
      headers: {
        'x-test-user-id': 'manager-1',
        'x-test-roles': 'resource_manager'
      }
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows researcher role to query availability and create bookings', async () => {
    const { app, resourceBookingService } = await buildTestApp();
    const availabilityResponse = await app.inject({
      method: 'GET',
      url: '/resource-booking/researcher/availability?startsAt=2026-06-01T10:00:00.000Z&endsAt=2026-06-01T11:00:00.000Z',
      headers: {
        'x-test-user-id': 'researcher-1',
        'x-test-roles': 'researcher'
      }
    });

    const bookingResponse = await app.inject({
      method: 'POST',
      url: '/resource-booking/researcher/bookings',
      headers: {
        'x-test-user-id': 'researcher-1',
        'x-test-roles': 'researcher',
        'content-type': 'application/json'
      },
      payload: {
        resourceId: 'c21c11bc-1fd0-4314-9f4d-0d0850ccf7af',
        startsAt: '2026-06-01T10:00:00.000Z',
        endsAt: '2026-06-01T11:00:00.000Z',
        seatsRequested: 1
      }
    });

    expect(availabilityResponse.statusCode).toBe(200);
    expect(bookingResponse.statusCode).toBe(201);
    expect(resourceBookingService.listResearcherAvailability).toHaveBeenCalled();
    expect(resourceBookingService.createResearcherBooking).toHaveBeenCalled();
  });
});
