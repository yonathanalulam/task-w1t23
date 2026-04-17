import { afterEach, describe, expect, it } from 'vitest';
import { createIntegrationDatabase } from './helpers/db-integration.js';

describe('resource-booking routes integration (true no-mock)', () => {
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

    await context.seedUser({ username: 'manager1', password: 'ManagerPass1!', roles: ['resource_manager'] });
    await context.seedUser({ username: 'researcher1', password: 'ResearcherPass1!', roles: ['researcher'] });

    const managerLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'manager1', password: 'ManagerPass1!' }
    });

    const researcherLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'researcher1', password: 'ResearcherPass1!' }
    });

    return {
      managerCookie: extractCookie(managerLogin.headers['set-cookie']),
      researcherCookie: extractCookie(researcherLogin.headers['set-cookie'])
    };
  };

  it('rejects unauthenticated GET /api/v1/resource-booking/manager/resources', async () => {
    await boot();
    const response = await app!.inject({ method: 'GET', url: '/api/v1/resource-booking/manager/resources' });
    expect(response.statusCode).toBe(401);
  }, integrationTimeout);

  it('returns 403 when researcher calls GET /api/v1/resource-booking/manager/resources', async () => {
    const { researcherCookie } = await boot();
    const response = await app!.inject({
      method: 'GET',
      url: '/api/v1/resource-booking/manager/resources',
      headers: { cookie: researcherCookie }
    });
    expect(response.statusCode).toBe(403);
  }, integrationTimeout);

  it('covers full manager resource lifecycle: POST/GET/PATCH/PUT business-hours/POST blackouts', async () => {
    const { managerCookie } = await boot();

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/resource-booking/manager/resources',
      headers: { 'content-type': 'application/json', cookie: managerCookie },
      payload: {
        resourceType: 'ROOM',
        name: 'Conference Room A',
        capacity: 10,
        isActive: true,
        timezone: 'UTC'
      }
    });
    expect(createResponse.statusCode).toBe(201);
    const resource = createResponse.json().resource;
    expect(resource.name).toBe('Conference Room A');
    expect(resource.capacity).toBe(10);
    const resourceId = resource.id as string;

    const listResponse = await app!.inject({
      method: 'GET',
      url: '/api/v1/resource-booking/manager/resources',
      headers: { cookie: managerCookie }
    });
    expect(listResponse.statusCode).toBe(200);
    const resources = listResponse.json().resources;
    expect(resources.some((entry: { id: string }) => entry.id === resourceId)).toBe(true);

    const detailResponse = await app!.inject({
      method: 'GET',
      url: `/api/v1/resource-booking/manager/resources/${resourceId}`,
      headers: { cookie: managerCookie }
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json().resource.id).toBe(resourceId);
    expect(Array.isArray(detailResponse.json().businessHours)).toBe(true);

    const patchResponse = await app!.inject({
      method: 'PATCH',
      url: `/api/v1/resource-booking/manager/resources/${resourceId}`,
      headers: { 'content-type': 'application/json', cookie: managerCookie },
      payload: {
        name: 'Conference Room A (updated)',
        capacity: 12,
        isActive: true,
        timezone: 'UTC'
      }
    });
    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json().resource.name).toBe('Conference Room A (updated)');
    expect(patchResponse.json().resource.capacity).toBe(12);

    const hoursResponse = await app!.inject({
      method: 'PUT',
      url: `/api/v1/resource-booking/manager/resources/${resourceId}/business-hours`,
      headers: { 'content-type': 'application/json', cookie: managerCookie },
      payload: {
        hours: [
          { dayOfWeek: 1, opensAt: '09:00', closesAt: '17:00' },
          { dayOfWeek: 2, opensAt: '09:00', closesAt: '17:00' },
          { dayOfWeek: 3, opensAt: '09:00', closesAt: '17:00' },
          { dayOfWeek: 4, opensAt: '09:00', closesAt: '17:00' },
          { dayOfWeek: 5, opensAt: '09:00', closesAt: '17:00' }
        ]
      }
    });
    expect(hoursResponse.statusCode).toBe(200);
    expect(Array.isArray(hoursResponse.json().businessHours)).toBe(true);
    expect(hoursResponse.json().businessHours.length).toBe(5);

    const blackoutResponse = await app!.inject({
      method: 'POST',
      url: `/api/v1/resource-booking/manager/resources/${resourceId}/blackouts`,
      headers: { 'content-type': 'application/json', cookie: managerCookie },
      payload: {
        startsAt: '2030-01-01T00:00:00.000Z',
        endsAt: '2030-01-02T00:00:00.000Z',
        reason: 'Maintenance window'
      }
    });
    expect(blackoutResponse.statusCode).toBe(201);
    expect(blackoutResponse.json().blackout.reason).toBe('Maintenance window');
  }, integrationTimeout);

  it('supports researcher availability + bookings via /api/v1/resource-booking/researcher/*', async () => {
    const { managerCookie, researcherCookie } = await boot();

    const createResource = await app!.inject({
      method: 'POST',
      url: '/api/v1/resource-booking/manager/resources',
      headers: { 'content-type': 'application/json', cookie: managerCookie },
      payload: {
        resourceType: 'ROOM',
        name: 'Booking Room',
        capacity: 5,
        isActive: true,
        timezone: 'UTC'
      }
    });
    const resourceId = createResource.json().resource.id as string;

    await app!.inject({
      method: 'PUT',
      url: `/api/v1/resource-booking/manager/resources/${resourceId}/business-hours`,
      headers: { 'content-type': 'application/json', cookie: managerCookie },
      payload: {
        hours: [
          { dayOfWeek: 1, opensAt: '00:00', closesAt: '23:59' },
          { dayOfWeek: 2, opensAt: '00:00', closesAt: '23:59' },
          { dayOfWeek: 3, opensAt: '00:00', closesAt: '23:59' },
          { dayOfWeek: 4, opensAt: '00:00', closesAt: '23:59' },
          { dayOfWeek: 5, opensAt: '00:00', closesAt: '23:59' },
          { dayOfWeek: 6, opensAt: '00:00', closesAt: '23:59' },
          { dayOfWeek: 7, opensAt: '00:00', closesAt: '23:59' }
        ]
      }
    });

    const availabilityResponse = await app!.inject({
      method: 'GET',
      url: '/api/v1/resource-booking/researcher/availability?startsAt=2030-01-06T10:00:00.000Z&endsAt=2030-01-06T12:00:00.000Z',
      headers: { cookie: researcherCookie }
    });
    expect(availabilityResponse.statusCode).toBe(200);
    expect(Array.isArray(availabilityResponse.json().resources)).toBe(true);

    const bookingResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/resource-booking/researcher/bookings',
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: {
        resourceId,
        startsAt: '2030-01-06T10:00:00.000Z',
        endsAt: '2030-01-06T11:00:00.000Z',
        seatsRequested: 1
      }
    });
    expect(bookingResponse.statusCode).toBe(201);
    expect(bookingResponse.json().booking.resourceId).toBe(resourceId);
    expect(bookingResponse.json().booking.seatsRequested).toBe(1);

    const listBookingsResponse = await app!.inject({
      method: 'GET',
      url: '/api/v1/resource-booking/researcher/bookings',
      headers: { cookie: researcherCookie }
    });
    expect(listBookingsResponse.statusCode).toBe(200);
    expect(listBookingsResponse.json().bookings.length).toBeGreaterThan(0);
  }, integrationTimeout);
});
