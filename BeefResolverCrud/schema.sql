-- A beef (dispute) between two people. New rows are linked to user accounts through
-- person_a_id (the creator) and person_b_id (the opponent); person_a/person_b keep the
-- display names at creation time. Rows without ids are legacy mock data.
CREATE TABLE IF NOT EXISTS beefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_a TEXT NOT NULL,
  person_b TEXT NOT NULL,
  person_a_id TEXT,
  person_b_id TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (person_a_id IS NULL AND person_a <> person_b)
    OR (person_a_id IS NOT NULL AND person_a_id <> person_b_id)
  )
);
