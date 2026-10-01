ALTER TABLE horses
  DROP COLUMN IF EXISTS coat_color,
  DROP COLUMN IF EXISTS face_marking,
  DROP COLUMN IF EXISTS leg_marking;
