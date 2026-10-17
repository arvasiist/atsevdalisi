DROP TRIGGER IF EXISTS trg_horses_clear_stall_on_owner_change ON horses;
DROP FUNCTION IF EXISTS horses_clear_stall_on_owner_change();
DROP INDEX IF EXISTS horses_owner_stall_uq;
ALTER TABLE horses DROP COLUMN IF EXISTS stall_number;
