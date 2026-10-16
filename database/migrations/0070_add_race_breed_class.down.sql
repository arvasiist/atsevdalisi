ALTER TABLE races DROP CONSTRAINT IF EXISTS races_breed_class_valid;
ALTER TABLE races DROP COLUMN IF EXISTS breed_class;
