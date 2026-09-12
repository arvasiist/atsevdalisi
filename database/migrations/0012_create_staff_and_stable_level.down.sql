DROP TRIGGER IF EXISTS trg_staff_updated_at ON staff;
DROP TABLE IF EXISTS staff;
ALTER TABLE players DROP COLUMN IF EXISTS stable_level;
