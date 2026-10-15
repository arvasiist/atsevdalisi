DROP INDEX IF EXISTS horses_recovery_due_idx;
ALTER TABLE horses DROP COLUMN IF EXISTS vitals_recovered_at;
