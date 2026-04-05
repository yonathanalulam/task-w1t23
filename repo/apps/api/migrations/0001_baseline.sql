CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS system_bootstrap_notes (
  id BIGSERIAL PRIMARY KEY,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_bootstrap_notes (note)
VALUES ('Slice 1 migration baseline initialized')
ON CONFLICT DO NOTHING;
