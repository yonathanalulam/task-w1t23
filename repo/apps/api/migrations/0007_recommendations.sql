CREATE TABLE IF NOT EXISTS recommendation_user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferred_disciplines TEXT[] NOT NULL DEFAULT '{}',
  preferred_keywords TEXT[] NOT NULL DEFAULT '{}',
  preferred_publishers TEXT[] NOT NULL DEFAULT '{}',
  preferred_resource_types TEXT[] NOT NULL DEFAULT '{}',
  preferred_locations TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (preferred_resource_types <@ ARRAY['ROOM', 'EQUIPMENT', 'CONSULTATION']::TEXT[])
);

CREATE TABLE IF NOT EXISTS recommendation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('JOURNAL', 'FUNDING_PROGRAM', 'RESOURCE')),
  target_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('LIKE', 'NOT_INTERESTED', 'BLOCK')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_feedback_user_updated
  ON recommendation_feedback (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_recommendation_feedback_target
  ON recommendation_feedback (target_type, target_id, action);
