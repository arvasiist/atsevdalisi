DROP INDEX IF EXISTS horses_retired_stallions_idx;
ALTER TABLE horses DROP CONSTRAINT IF EXISTS horses_retired_at_requires_status;
ALTER TABLE horses DROP COLUMN IF EXISTS retired_at;
ALTER TABLE horses DROP COLUMN IF EXISTS aging_started_at;
