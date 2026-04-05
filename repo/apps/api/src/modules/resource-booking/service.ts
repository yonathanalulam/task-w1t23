import { HttpError } from '../../lib/http-error.js';
import type { AuditWriteInput } from '../audit/types.js';
import { BookingCapacityError, createResourceBookingRepository } from './repository.js';
import type { ResourceType } from './types.js';

type ResourceBookingRepository = ReturnType<typeof createResourceBookingRepository>;

interface AuditWriter {
  write(input: AuditWriteInput): Promise<void>;
}

const RESOURCE_TYPES: ResourceType[] = ['ROOM', 'EQUIPMENT', 'CONSULTATION'];

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const withMeta = (meta: { requestId?: string; ip?: string; userAgent?: string }) => ({
  ...(meta.requestId ? { requestId: meta.requestId } : {}),
  ...(meta.ip ? { ip: meta.ip } : {}),
  ...(meta.userAgent ? { userAgent: meta.userAgent } : {})
});

const parseDateTime = (value: string, code: string, message: string): Date => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, code, message);
  }
  return date;
};

const normalizeBusinessHours = (hours: Array<{ dayOfWeek: number; opensAt: string; closesAt: string }>) => {
  if (hours.length === 0) {
    throw new HttpError(400, 'BUSINESS_HOURS_REQUIRED', 'At least one business-hours day definition is required.');
  }

  const seenDays = new Set<number>();

  return hours.map((entry) => {
    if (entry.dayOfWeek < 1 || entry.dayOfWeek > 7) {
      throw new HttpError(400, 'INVALID_BUSINESS_DAY', 'dayOfWeek must be between 1 and 7 (ISO Monday-Sunday).');
    }

    if (seenDays.has(entry.dayOfWeek)) {
      throw new HttpError(400, 'DUPLICATE_BUSINESS_DAY', `Business-hours day ${entry.dayOfWeek} is defined multiple times.`);
    }
    seenDays.add(entry.dayOfWeek);

    if (!timePattern.test(entry.opensAt) || !timePattern.test(entry.closesAt)) {
      throw new HttpError(400, 'INVALID_BUSINESS_TIME', 'Business-hours times must use HH:MM 24-hour format.');
    }

    if (entry.closesAt <= entry.opensAt) {
      throw new HttpError(400, 'INVALID_BUSINESS_TIME_RANGE', 'Business-hours close time must be after open time.');
    }

    return {
      dayOfWeek: entry.dayOfWeek,
      opensAt: `${entry.opensAt}:00`,
      closesAt: `${entry.closesAt}:00`
    };
  });
};

export const createResourceBookingService = (deps: { repository: ResourceBookingRepository; audit: AuditWriter }) => {
  const { repository, audit } = deps;

  return {
    async listManagerResources(includeInactive = true) {
      return repository.listResources(includeInactive);
    },

    async getManagerResourceDetail(resourceId: string) {
      const resource = await repository.getResourceById(resourceId);
      if (!resource) {
        throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
      }

      const [businessHours, blackouts] = await Promise.all([
        repository.listBusinessHours(resourceId),
        repository.listBlackoutWindows(resourceId)
      ]);

      return {
        resource,
        businessHours,
        blackouts
      };
    },

    async createResource(input: {
      actorUserId: string;
      resourceType: string;
      name: string;
      description?: string;
      location?: string;
      capacity: number;
      timezone?: string;
      isActive: boolean;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      const resourceType = input.resourceType as ResourceType;
      if (!RESOURCE_TYPES.includes(resourceType)) {
        throw new HttpError(400, 'INVALID_RESOURCE_TYPE', 'Unsupported resource type.');
      }

      if (!input.name.trim()) {
        throw new HttpError(400, 'RESOURCE_NAME_REQUIRED', 'Resource name is required.');
      }

      if (!Number.isInteger(input.capacity) || input.capacity < 1) {
        throw new HttpError(400, 'INVALID_RESOURCE_CAPACITY', 'Resource capacity must be an integer greater than zero.');
      }

      try {
        const created = await repository.createResource({
          resourceType,
          name: input.name.trim(),
          ...(input.description?.trim() ? { description: input.description.trim() } : {}),
          ...(input.location?.trim() ? { location: input.location.trim() } : {}),
          capacity: input.capacity,
          timezone: input.timezone?.trim() || 'UTC',
          isActive: input.isActive,
          actorUserId: input.actorUserId
        });

        await audit.write({
          actorUserId: input.actorUserId,
          eventType: 'RESOURCE_CREATED',
          entityType: 'resource',
          entityId: created.id,
          outcome: 'success',
          details: {
            name: created.name,
            resourceType: created.resourceType,
            capacity: created.capacity,
            timezone: created.timezone
          },
          ...withMeta(input.meta)
        });

        return created;
      } catch (error) {
        if (String(error).includes('resources_name_key')) {
          throw new HttpError(409, 'RESOURCE_NAME_EXISTS', 'A resource with this name already exists.');
        }
        throw error;
      }
    },

    async updateResource(input: {
      actorUserId: string;
      resourceId: string;
      name: string;
      description?: string;
      location?: string;
      capacity: number;
      timezone?: string;
      isActive: boolean;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      if (!input.name.trim()) {
        throw new HttpError(400, 'RESOURCE_NAME_REQUIRED', 'Resource name is required.');
      }

      if (!Number.isInteger(input.capacity) || input.capacity < 1) {
        throw new HttpError(400, 'INVALID_RESOURCE_CAPACITY', 'Resource capacity must be an integer greater than zero.');
      }

      try {
        const updated = await repository.updateResource({
          resourceId: input.resourceId,
          name: input.name.trim(),
          ...(input.description?.trim() ? { description: input.description.trim() } : {}),
          ...(input.location?.trim() ? { location: input.location.trim() } : {}),
          capacity: input.capacity,
          timezone: input.timezone?.trim() || 'UTC',
          isActive: input.isActive,
          actorUserId: input.actorUserId
        });

        if (!updated) {
          throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
        }

        await audit.write({
          actorUserId: input.actorUserId,
          eventType: 'RESOURCE_UPDATED',
          entityType: 'resource',
          entityId: updated.id,
          outcome: 'success',
          details: {
            name: updated.name,
            capacity: updated.capacity,
            timezone: updated.timezone,
            isActive: updated.isActive
          },
          ...withMeta(input.meta)
        });

        return updated;
      } catch (error) {
        if (String(error).includes('resources_name_key')) {
          throw new HttpError(409, 'RESOURCE_NAME_EXISTS', 'A resource with this name already exists.');
        }
        throw error;
      }
    },

    async setBusinessHours(input: {
      actorUserId: string;
      resourceId: string;
      hours: Array<{ dayOfWeek: number; opensAt: string; closesAt: string }>;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      const resource = await repository.getResourceById(input.resourceId);
      if (!resource) {
        throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
      }

      const normalizedHours = normalizeBusinessHours(input.hours);
      await repository.replaceBusinessHours(input.resourceId, normalizedHours);

      await audit.write({
        actorUserId: input.actorUserId,
        eventType: 'RESOURCE_BUSINESS_HOURS_UPDATED',
        entityType: 'resource',
        entityId: input.resourceId,
        outcome: 'success',
        details: {
          dayCount: normalizedHours.length,
          timezone: resource.timezone
        },
        ...withMeta(input.meta)
      });

      return repository.listBusinessHours(input.resourceId);
    },

    async addBlackoutWindow(input: {
      actorUserId: string;
      resourceId: string;
      startsAt: string;
      endsAt: string;
      reason: string;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      const resource = await repository.getResourceById(input.resourceId);
      if (!resource) {
        throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
      }

      const startsAt = parseDateTime(input.startsAt, 'INVALID_BLACKOUT_START', 'Blackout start time must be a valid date-time.');
      const endsAt = parseDateTime(input.endsAt, 'INVALID_BLACKOUT_END', 'Blackout end time must be a valid date-time.');
      const reason = input.reason.trim();
      if (!reason) {
        throw new HttpError(400, 'BLACKOUT_REASON_REQUIRED', 'Blackout reason is required.');
      }
      if (endsAt <= startsAt) {
        throw new HttpError(400, 'INVALID_BLACKOUT_RANGE', 'Blackout end time must be after start time.');
      }

      try {
        const blackout = await repository.createBlackoutWindow({
          resourceId: input.resourceId,
          startsAt,
          endsAt,
          reason,
          actorUserId: input.actorUserId
        });

        await audit.write({
          actorUserId: input.actorUserId,
          eventType: 'RESOURCE_BLACKOUT_CREATED',
          entityType: 'resource',
          entityId: input.resourceId,
          outcome: 'success',
          details: {
            blackoutId: blackout.id,
            startsAt: blackout.startsAt.toISOString(),
            endsAt: blackout.endsAt.toISOString(),
            reason: blackout.reason
          },
          ...withMeta(input.meta)
        });

        return blackout;
      } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23P01') {
          throw new HttpError(409, 'BLACKOUT_OVERLAP', 'Blackout window overlaps an existing blackout period.');
        }
        throw error;
      }
    },

    async listResearcherAvailability(input: { startsAt: string; endsAt: string }) {
      const startsAt = parseDateTime(input.startsAt, 'INVALID_BOOKING_START', 'Requested start time must be a valid date-time.');
      const endsAt = parseDateTime(input.endsAt, 'INVALID_BOOKING_END', 'Requested end time must be a valid date-time.');

      if (endsAt <= startsAt) {
        throw new HttpError(400, 'INVALID_BOOKING_RANGE', 'Booking end time must be after start time.');
      }

      return repository.listAvailability({
        startsAt,
        endsAt,
        includeInactive: false
      });
    },

    async listResearcherBookings(researcherUserId: string) {
      return repository.listBookingsByResearcher(researcherUserId);
    },

    async createResearcherBooking(input: {
      researcherUserId: string;
      resourceId: string;
      startsAt: string;
      endsAt: string;
      seatsRequested: number;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      const resource = await repository.getResourceById(input.resourceId);
      if (!resource || !resource.isActive) {
        throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
      }

      if (!Number.isInteger(input.seatsRequested) || input.seatsRequested < 1) {
        throw new HttpError(400, 'INVALID_SEAT_REQUEST', 'Seats requested must be an integer greater than zero.');
      }

      if (input.seatsRequested > resource.capacity) {
        throw new HttpError(409, 'RESOURCE_CAPACITY_EXCEEDED', 'Requested seats exceed resource capacity.');
      }

      const startsAt = parseDateTime(input.startsAt, 'INVALID_BOOKING_START', 'Requested start time must be a valid date-time.');
      const endsAt = parseDateTime(input.endsAt, 'INVALID_BOOKING_END', 'Requested end time must be a valid date-time.');
      if (endsAt <= startsAt) {
        throw new HttpError(400, 'INVALID_BOOKING_RANGE', 'Booking end time must be after start time.');
      }

      const businessWindow = await repository.evaluateBusinessHoursWindow({
        resourceId: input.resourceId,
        startsAt,
        endsAt
      });

      if (!businessWindow) {
        throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
      }

      if (!businessWindow.sameLocalDay) {
        throw new HttpError(409, 'BOOKING_OUTSIDE_BUSINESS_HOURS', 'Bookings must start and end within the same local business day.');
      }

      if (!businessWindow.opensAt || !businessWindow.closesAt) {
        throw new HttpError(409, 'RESOURCE_CLOSED_DAY', 'Resource is closed on the selected day.');
      }

      if (businessWindow.localStartTime < businessWindow.opensAt || businessWindow.localEndTime > businessWindow.closesAt) {
        throw new HttpError(
          409,
          'BOOKING_OUTSIDE_BUSINESS_HOURS',
          `Booking must fall within business hours ${businessWindow.opensAt} - ${businessWindow.closesAt} (${businessWindow.resourceTimezone}).`
        );
      }

      const blackout = await repository.findOverlappingBlackout({
        resourceId: input.resourceId,
        startsAt,
        endsAt
      });

      if (blackout) {
        throw new HttpError(409, 'RESOURCE_BLACKED_OUT', `Resource is unavailable due to maintenance blackout: ${blackout.reason}`);
      }

      try {
        const booking = await repository.createBookingWithAllocations({
          resourceId: input.resourceId,
          researcherUserId: input.researcherUserId,
          startsAt,
          endsAt,
          seatsRequested: input.seatsRequested,
          resourceCapacity: resource.capacity
        });

        await audit.write({
          actorUserId: input.researcherUserId,
          eventType: 'RESOURCE_BOOKING_CREATED',
          entityType: 'resource_booking',
          entityId: booking.id,
          outcome: 'success',
          details: {
            resourceId: booking.resourceId,
            startsAt: booking.startsAt.toISOString(),
            endsAt: booking.endsAt.toISOString(),
            seatsRequested: booking.seatsRequested
          },
          ...withMeta(input.meta)
        });

        return booking;
      } catch (error: unknown) {
        if (error instanceof BookingCapacityError) {
          throw new HttpError(409, 'RESOURCE_CAPACITY_EXCEEDED', 'Requested seats exceed remaining capacity for this time window.');
        }

        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23P01') {
          throw new HttpError(409, 'RESOURCE_BOOKING_CONFLICT', 'Booking conflict detected. The selected slot was just reserved by another request.');
        }

        throw error;
      }
    }
  };
};
