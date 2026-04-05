import type { Pool, PoolClient } from 'pg';
import type {
  BlackoutWindowRecord,
  BusinessHourRecord,
  ResourceAvailabilityRecord,
  ResourceBookingRecord,
  ResourceRecord,
  ResourceType
} from './types.js';

const toDate = (value: unknown): Date => (value instanceof Date ? value : new Date(String(value)));

export class BookingCapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookingCapacityError';
  }
}

const mapResource = (row: Record<string, unknown>): ResourceRecord => ({
  id: String(row.id),
  resourceType: String(row.resource_type) as ResourceType,
  name: String(row.name),
  description: row.description ? String(row.description) : null,
  location: row.location ? String(row.location) : null,
  capacity: Number(row.capacity),
  timezone: String(row.timezone),
  isActive: Boolean(row.is_active),
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at)
});

const mapBusinessHour = (row: Record<string, unknown>): BusinessHourRecord => ({
  id: Number(row.id),
  resourceId: String(row.resource_id),
  dayOfWeek: Number(row.day_of_week),
  opensAt: String(row.opens_at),
  closesAt: String(row.closes_at),
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at)
});

const mapBlackout = (row: Record<string, unknown>): BlackoutWindowRecord => ({
  id: String(row.id),
  resourceId: String(row.resource_id),
  startsAt: toDate(row.starts_at),
  endsAt: toDate(row.ends_at),
  reason: String(row.reason),
  createdByUserId: String(row.created_by_user_id),
  createdAt: toDate(row.created_at)
});

const mapBooking = (row: Record<string, unknown>): ResourceBookingRecord => ({
  id: String(row.id),
  resourceId: String(row.resource_id),
  researcherUserId: String(row.researcher_user_id),
  startsAt: toDate(row.starts_at),
  endsAt: toDate(row.ends_at),
  seatsRequested: Number(row.seats_requested),
  status: String(row.status) as ResourceBookingRecord['status'],
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at),
  ...(row.resource_name ? { resourceName: String(row.resource_name) } : {}),
  ...(row.resource_type ? { resourceType: String(row.resource_type) as ResourceType } : {})
});

const withTransaction = async <T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const createResourceBookingRepository = (pool: Pool) => {
  return {
    async listResources(includeInactive = false): Promise<ResourceRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT *
        FROM resources
        ${includeInactive ? '' : 'WHERE is_active = TRUE'}
        ORDER BY name ASC
        `
      );

      return result.rows.map(mapResource);
    },

    async getResourceById(resourceId: string): Promise<ResourceRecord | null> {
      const result = await pool.query<Record<string, unknown>>('SELECT * FROM resources WHERE id = $1', [resourceId]);
      const row = result.rows[0];
      return row ? mapResource(row) : null;
    },

    async createResource(input: {
      resourceType: ResourceType;
      name: string;
      description?: string;
      location?: string;
      capacity: number;
      timezone: string;
      isActive: boolean;
      actorUserId: string;
    }): Promise<ResourceRecord> {
      return withTransaction(pool, async (client) => {
        const created = await client.query<Record<string, unknown>>(
          `
          INSERT INTO resources (
            resource_type,
            name,
            description,
            location,
            capacity,
            timezone,
            is_active,
            created_by_user_id,
            updated_by_user_id
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
          RETURNING *
          `,
          [
            input.resourceType,
            input.name,
            input.description ?? null,
            input.location ?? null,
            input.capacity,
            input.timezone,
            input.isActive,
            input.actorUserId
          ]
        );

        const resource = created.rows[0];
        if (!resource) {
          throw new Error('Failed to create resource.');
        }

        await client.query(
          `
          INSERT INTO resource_business_hours (resource_id, day_of_week, opens_at, closes_at)
          VALUES
            ($1,1,'08:00','18:00'),
            ($1,2,'08:00','18:00'),
            ($1,3,'08:00','18:00'),
            ($1,4,'08:00','18:00'),
            ($1,5,'08:00','18:00')
          `,
          [resource.id]
        );

        return mapResource(resource);
      });
    },

    async updateResource(input: {
      resourceId: string;
      name: string;
      description?: string;
      location?: string;
      capacity: number;
      timezone: string;
      isActive: boolean;
      actorUserId: string;
    }): Promise<ResourceRecord | null> {
      const result = await pool.query<Record<string, unknown>>(
        `
        UPDATE resources
        SET name = $2,
            description = $3,
            location = $4,
            capacity = $5,
            timezone = $6,
            is_active = $7,
            updated_by_user_id = $8,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [
          input.resourceId,
          input.name,
          input.description ?? null,
          input.location ?? null,
          input.capacity,
          input.timezone,
          input.isActive,
          input.actorUserId
        ]
      );

      const row = result.rows[0];
      return row ? mapResource(row) : null;
    },

    async listBusinessHours(resourceId: string): Promise<BusinessHourRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT *
        FROM resource_business_hours
        WHERE resource_id = $1
        ORDER BY day_of_week ASC
        `,
        [resourceId]
      );

      return result.rows.map(mapBusinessHour);
    },

    async replaceBusinessHours(resourceId: string, hours: Array<{ dayOfWeek: number; opensAt: string; closesAt: string }>): Promise<void> {
      await withTransaction(pool, async (client) => {
        await client.query('DELETE FROM resource_business_hours WHERE resource_id = $1', [resourceId]);
        for (const entry of hours) {
          await client.query(
            `
            INSERT INTO resource_business_hours (resource_id, day_of_week, opens_at, closes_at)
            VALUES ($1,$2,$3,$4)
            `,
            [resourceId, entry.dayOfWeek, entry.opensAt, entry.closesAt]
          );
        }
      });
    },

    async listBlackoutWindows(resourceId: string): Promise<BlackoutWindowRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT *
        FROM resource_blackout_windows
        WHERE resource_id = $1
        ORDER BY starts_at ASC
        `,
        [resourceId]
      );

      return result.rows.map(mapBlackout);
    },

    async createBlackoutWindow(input: {
      resourceId: string;
      startsAt: Date;
      endsAt: Date;
      reason: string;
      actorUserId: string;
    }): Promise<BlackoutWindowRecord> {
      const result = await pool.query<Record<string, unknown>>(
        `
        INSERT INTO resource_blackout_windows (
          resource_id,
          starts_at,
          ends_at,
          reason,
          created_by_user_id
        ) VALUES ($1,$2,$3,$4,$5)
        RETURNING *
        `,
        [input.resourceId, input.startsAt.toISOString(), input.endsAt.toISOString(), input.reason, input.actorUserId]
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error('Failed to create blackout window.');
      }

      return mapBlackout(row);
    },

    async findOverlappingBlackout(input: { resourceId: string; startsAt: Date; endsAt: Date }): Promise<BlackoutWindowRecord | null> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT *
        FROM resource_blackout_windows
        WHERE resource_id = $1
          AND tstzrange(starts_at, ends_at, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
        ORDER BY starts_at ASC
        LIMIT 1
        `,
        [input.resourceId, input.startsAt.toISOString(), input.endsAt.toISOString()]
      );

      const row = result.rows[0];
      return row ? mapBlackout(row) : null;
    },

    async evaluateBusinessHoursWindow(input: { resourceId: string; startsAt: Date; endsAt: Date }): Promise<{
      resourceTimezone: string;
      sameLocalDay: boolean;
      localDayOfWeek: number;
      localStartTime: string;
      localEndTime: string;
      opensAt: string | null;
      closesAt: string | null;
    } | null> {
      const result = await pool.query<Record<string, unknown>>(
        `
        WITH context AS (
          SELECT
            r.id,
            r.timezone,
            (($2::timestamptz AT TIME ZONE r.timezone)::date = ($3::timestamptz AT TIME ZONE r.timezone)::date) AS same_local_day,
            EXTRACT(ISODOW FROM ($2::timestamptz AT TIME ZONE r.timezone))::int AS local_day_of_week,
            ($2::timestamptz AT TIME ZONE r.timezone)::time AS local_start_time,
            ($3::timestamptz AT TIME ZONE r.timezone)::time AS local_end_time
          FROM resources r
          WHERE r.id = $1
        )
        SELECT
          c.timezone,
          c.same_local_day,
          c.local_day_of_week,
          c.local_start_time,
          c.local_end_time,
          h.opens_at,
          h.closes_at
        FROM context c
        LEFT JOIN resource_business_hours h
          ON h.resource_id = c.id
         AND h.day_of_week = c.local_day_of_week
        `,
        [input.resourceId, input.startsAt.toISOString(), input.endsAt.toISOString()]
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        resourceTimezone: String(row.timezone),
        sameLocalDay: Boolean(row.same_local_day),
        localDayOfWeek: Number(row.local_day_of_week),
        localStartTime: String(row.local_start_time),
        localEndTime: String(row.local_end_time),
        opensAt: row.opens_at ? String(row.opens_at) : null,
        closesAt: row.closes_at ? String(row.closes_at) : null
      };
    },

    async listAvailability(input: { startsAt: Date; endsAt: Date; includeInactive: boolean }): Promise<ResourceAvailabilityRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT
          r.*,
          $1::timestamptz AS requested_starts_at,
          $2::timestamptz AS requested_ends_at,
          COALESCE((
            SELECT COUNT(*)
            FROM resource_booking_allocations a
            JOIN resource_bookings b ON b.id = a.booking_id
            WHERE a.resource_id = r.id
              AND b.status = 'CONFIRMED'
              AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange($1::timestamptz, $2::timestamptz, '[)')
          ), 0) AS booked_seats,
          (
            SELECT bw.reason
            FROM resource_blackout_windows bw
            WHERE bw.resource_id = r.id
              AND tstzrange(bw.starts_at, bw.ends_at, '[)') && tstzrange($1::timestamptz, $2::timestamptz, '[)')
            ORDER BY bw.starts_at ASC
            LIMIT 1
          ) AS blackout_reason
        FROM resources r
        ${input.includeInactive ? '' : 'WHERE r.is_active = TRUE'}
        ORDER BY r.name ASC
        `,
        [input.startsAt.toISOString(), input.endsAt.toISOString()]
      );

      return result.rows.map((row) => {
        const resource = mapResource(row);
        const bookedSeats = Number(row.booked_seats ?? 0);
        const blackoutReason = row.blackout_reason ? String(row.blackout_reason) : null;

        return {
          ...resource,
          requestedStartsAt: toDate(row.requested_starts_at),
          requestedEndsAt: toDate(row.requested_ends_at),
          bookedSeats,
          availableSeats: Math.max(0, resource.capacity - bookedSeats),
          isBlackedOut: Boolean(blackoutReason),
          blackoutReason
        };
      });
    },

    async createBookingWithAllocations(input: {
      resourceId: string;
      researcherUserId: string;
      startsAt: Date;
      endsAt: Date;
      seatsRequested: number;
      resourceCapacity: number;
    }): Promise<ResourceBookingRecord> {
      return withTransaction(pool, async (client) => {
        const availableSeatRows = await client.query<{ seat_number: string }>(
          `
          SELECT seat_number::text
          FROM generate_series(1, $3::int) AS seat_number
          WHERE NOT EXISTS (
            SELECT 1
            FROM resource_booking_allocations a
            JOIN resource_bookings b ON b.id = a.booking_id
            WHERE a.resource_id = $1
              AND b.status = 'CONFIRMED'
              AND a.seat_number = seat_number
              AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange($2::timestamptz, $4::timestamptz, '[)')
          )
          ORDER BY seat_number
          LIMIT $5
          `,
          [input.resourceId, input.startsAt.toISOString(), input.resourceCapacity, input.endsAt.toISOString(), input.seatsRequested]
        );

        const seatNumbers = availableSeatRows.rows.map((row) => Number(row.seat_number));
        if (seatNumbers.length < input.seatsRequested) {
          throw new BookingCapacityError('Requested seats exceed currently available capacity.');
        }

        const bookingResult = await client.query<Record<string, unknown>>(
          `
          INSERT INTO resource_bookings (
            resource_id,
            researcher_user_id,
            starts_at,
            ends_at,
            seats_requested,
            status
          ) VALUES ($1,$2,$3,$4,$5,'CONFIRMED')
          RETURNING *
          `,
          [input.resourceId, input.researcherUserId, input.startsAt.toISOString(), input.endsAt.toISOString(), input.seatsRequested]
        );

        const booking = bookingResult.rows[0];
        if (!booking) {
          throw new Error('Failed to create booking.');
        }

        for (const seatNumber of seatNumbers) {
          await client.query(
            `
            INSERT INTO resource_booking_allocations (
              booking_id,
              resource_id,
              seat_number,
              starts_at,
              ends_at
            ) VALUES ($1,$2,$3,$4,$5)
            `,
            [booking.id, input.resourceId, seatNumber, input.startsAt.toISOString(), input.endsAt.toISOString()]
          );
        }

        return mapBooking(booking);
      });
    },

    async listBookingsByResearcher(researcherUserId: string): Promise<ResourceBookingRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT
          b.*,
          r.name AS resource_name,
          r.resource_type
        FROM resource_bookings b
        JOIN resources r ON r.id = b.resource_id
        WHERE b.researcher_user_id = $1
        ORDER BY b.starts_at DESC
        `,
        [researcherUserId]
      );

      return result.rows.map(mapBooking);
    }
  };
};
