ALTER TABLE funding_policies
  ADD COLUMN IF NOT EXISTS approval_levels_required INTEGER NOT NULL DEFAULT 1;

ALTER TABLE funding_policies
  DROP CONSTRAINT IF EXISTS chk_funding_policies_approval_levels_required;

ALTER TABLE funding_policies
  ADD CONSTRAINT chk_funding_policies_approval_levels_required
  CHECK (approval_levels_required BETWEEN 1 AND 3);

CREATE TABLE IF NOT EXISTS application_workflow_state (
  application_id UUID PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  iteration_number INTEGER NOT NULL DEFAULT 0 CHECK (iteration_number >= 0),
  required_approval_levels INTEGER NOT NULL DEFAULT 1 CHECK (required_approval_levels BETWEEN 1 AND 3),
  next_approval_level INTEGER CHECK (next_approval_level BETWEEN 1 AND 3),
  last_reviewer_decision TEXT NOT NULL DEFAULT 'NONE' CHECK (last_reviewer_decision IN ('NONE', 'FORWARDED', 'RETURNED', 'REJECTED')),
  last_reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (next_approval_level IS NULL OR next_approval_level <= required_approval_levels)
);

CREATE TABLE IF NOT EXISTS application_review_actions (
  id BIGSERIAL PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  iteration_number INTEGER NOT NULL CHECK (iteration_number > 0),
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('reviewer', 'approver')),
  decision TEXT NOT NULL CHECK (decision IN ('REVIEW_FORWARD', 'REVIEW_RETURN', 'REVIEW_REJECT', 'APPROVE_LEVEL', 'REJECT_LEVEL')),
  approval_level INTEGER NOT NULL DEFAULT 0 CHECK (approval_level BETWEEN 0 AND 3),
  comment TEXT NOT NULL CHECK (length(btrim(comment)) > 0),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (actor_role = 'reviewer' AND approval_level = 0 AND decision IN ('REVIEW_FORWARD', 'REVIEW_RETURN', 'REVIEW_REJECT'))
    OR (actor_role = 'approver' AND approval_level BETWEEN 1 AND 3 AND decision IN ('APPROVE_LEVEL', 'REJECT_LEVEL'))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_review_actions_reviewer_iteration
  ON application_review_actions (application_id, iteration_number)
  WHERE actor_role = 'reviewer';

CREATE UNIQUE INDEX IF NOT EXISTS ux_review_actions_approver_level
  ON application_review_actions (application_id, iteration_number, approval_level)
  WHERE actor_role = 'approver';

CREATE INDEX IF NOT EXISTS idx_review_actions_application_created
  ON application_review_actions (application_id, created_at ASC);

DROP TRIGGER IF EXISTS trg_no_update_delete_application_review_actions ON application_review_actions;
CREATE TRIGGER trg_no_update_delete_application_review_actions
  BEFORE UPDATE OR DELETE ON application_review_actions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_table_mutation();
