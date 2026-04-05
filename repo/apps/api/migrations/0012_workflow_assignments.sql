CREATE TABLE IF NOT EXISTS application_assignments (
  id BIGSERIAL PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  iteration_number INTEGER NOT NULL CHECK (iteration_number > 0),
  actor_role TEXT NOT NULL CHECK (actor_role IN ('reviewer', 'approver')),
  approval_level INTEGER NOT NULL DEFAULT 0 CHECK (approval_level BETWEEN 0 AND 3),
  assigned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (actor_role = 'reviewer' AND approval_level = 0)
    OR (actor_role = 'approver' AND approval_level BETWEEN 1 AND 3)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_application_assignments_slot
  ON application_assignments (application_id, iteration_number, actor_role, approval_level);

CREATE INDEX IF NOT EXISTS idx_application_assignments_actor
  ON application_assignments (assigned_user_id, actor_role, assigned_at DESC);
