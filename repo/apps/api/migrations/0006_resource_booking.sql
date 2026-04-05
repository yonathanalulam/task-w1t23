CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('ROOM', 'EQUIPMENT', 'CONSULTATION')),
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_resources_active ON resources (is_active, updated_at DESC);

CREATE TABLE IF NOT EXISTS resource_business_hours (
  id BIGSERIAL PRIMARY KEY,
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  opens_at TIME NOT NULL,
  closes_at TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (closes_at > opens_at),
  UNIQUE (resource_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS resource_blackout_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

ALTER TABLE resource_blackout_windows
  DROP CONSTRAINT IF EXISTS ex_resource_blackout_overlap;

ALTER TABLE resource_blackout_windows
  ADD CONSTRAINT ex_resource_blackout_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  );

CREATE INDEX IF NOT EXISTS idx_resource_blackouts_lookup ON resource_blackout_windows (resource_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS resource_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
  researcher_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  seats_requested INTEGER NOT NULL DEFAULT 1 CHECK (seats_requested > 0),
  status TEXT NOT NULL CHECK (status IN ('CONFIRMED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_resource_bookings_lookup ON resource_bookings (resource_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_resource_bookings_researcher ON resource_bookings (researcher_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS resource_booking_allocations (
  id BIGSERIAL PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES resource_bookings(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  seat_number INTEGER NOT NULL CHECK (seat_number > 0),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at),
  UNIQUE (booking_id, seat_number)
);

ALTER TABLE resource_booking_allocations
  DROP CONSTRAINT IF EXISTS ex_resource_booking_allocation_overlap;

ALTER TABLE resource_booking_allocations
  ADD CONSTRAINT ex_resource_booking_allocation_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    seat_number WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  );

CREATE INDEX IF NOT EXISTS idx_resource_booking_allocations_lookup ON resource_booking_allocations (resource_id, starts_at, ends_at);
