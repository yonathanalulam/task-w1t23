import { describe, expect, it, vi } from 'vitest';
import { BookingCapacityError } from '../src/modules/resource-booking/repository.js';
import { createResourceBookingService } from '../src/modules/resource-booking/service.js';

const makeRepository = () => {
  return {
    listResources: vi.fn(async () => []),
    getResourceById: vi.fn(async () => ({
      id: 'resource-1',
      resourceType: 'ROOM',
      name: 'Conference Room',
      description: null,
      location: null,
      capacity: 2,
      timezone: 'UTC',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    })),
    listBusinessHours: vi.fn(async () => []),
    listBlackoutWindows: vi.fn(async () => []),
    createResource: vi.fn(),
    updateResource: vi.fn(),
    replaceBusinessHours: vi.fn(async () => undefined),
    createBlackoutWindow: vi.fn(),
    findOverlappingBlackout: vi.fn(async () => null),
    evaluateBusinessHoursWindow: vi.fn(async () => ({
      resourceTimezone: 'UTC',
      sameLocalDay: true,
      localDayOfWeek: 1,
      localStartTime: '10:00:00',
      localEndTime: '11:00:00',
      opensAt: '08:00:00',
      closesAt: '18:00:00'
    })),
    listAvailability: vi.fn(async () => []),
    listBookingsByResearcher: vi.fn(async () => []),
    createBookingWithAllocations: vi.fn(async () => ({
      id: 'booking-1',
      resourceId: 'resource-1',
      researcherUserId: 'researcher-1',
      startsAt: new Date('2026-06-01T10:00:00.000Z'),
      endsAt: new Date('2026-06-01T11:00:00.000Z'),
      seatsRequested: 1,
      status: 'CONFIRMED',
      createdAt: new Date(),
      updatedAt: new Date()
    }))
  };
};

describe('resource booking service', () => {
  it('rejects invalid business-hours payloads with duplicate weekdays', async () => {
    const repository = makeRepository();
    const service = createResourceBookingService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await expect(
      service.setBusinessHours({
        actorUserId: 'manager-1',
        resourceId: 'resource-1',
        hours: [
          { dayOfWeek: 1, opensAt: '08:00', closesAt: '18:00' },
          { dayOfWeek: 1, opensAt: '09:00', closesAt: '17:00' }
        ],
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'DUPLICATE_BUSINESS_DAY');
  });

  it('rejects researcher booking when overlapping blackout exists', async () => {
    const repository = makeRepository();
    repository.findOverlappingBlackout.mockResolvedValueOnce({
      id: 'blackout-1',
      resourceId: 'resource-1',
      startsAt: new Date('2026-06-01T09:00:00.000Z'),
      endsAt: new Date('2026-06-01T12:00:00.000Z'),
      reason: 'Maintenance',
      createdByUserId: 'manager-1',
      createdAt: new Date()
    });

    const service = createResourceBookingService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await expect(
      service.createResearcherBooking({
        researcherUserId: 'researcher-1',
        resourceId: 'resource-1',
        startsAt: '2026-06-01T10:00:00.000Z',
        endsAt: '2026-06-01T11:00:00.000Z',
        seatsRequested: 1,
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'RESOURCE_BLACKED_OUT');
  });

  it('rejects seat request above configured resource capacity', async () => {
    const repository = makeRepository();
    const service = createResourceBookingService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await expect(
      service.createResearcherBooking({
        researcherUserId: 'researcher-1',
        resourceId: 'resource-1',
        startsAt: '2026-06-01T10:00:00.000Z',
        endsAt: '2026-06-01T11:00:00.000Z',
        seatsRequested: 3,
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'RESOURCE_CAPACITY_EXCEEDED');
  });

  it('maps allocation-capacity race to capacity conflict error', async () => {
    const repository = makeRepository();
    repository.createBookingWithAllocations.mockRejectedValueOnce(new BookingCapacityError('exceeded'));
    const service = createResourceBookingService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await expect(
      service.createResearcherBooking({
        researcherUserId: 'researcher-1',
        resourceId: 'resource-1',
        startsAt: '2026-06-01T10:00:00.000Z',
        endsAt: '2026-06-01T11:00:00.000Z',
        seatsRequested: 1,
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'RESOURCE_CAPACITY_EXCEEDED');
  });

  it('maps exclusion-constraint collision to booking conflict error', async () => {
    const repository = makeRepository();
    repository.createBookingWithAllocations.mockRejectedValueOnce({ code: '23P01' });
    const service = createResourceBookingService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await expect(
      service.createResearcherBooking({
        researcherUserId: 'researcher-1',
        resourceId: 'resource-1',
        startsAt: '2026-06-01T10:00:00.000Z',
        endsAt: '2026-06-01T11:00:00.000Z',
        seatsRequested: 1,
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'RESOURCE_BOOKING_CONFLICT');
  });
});
