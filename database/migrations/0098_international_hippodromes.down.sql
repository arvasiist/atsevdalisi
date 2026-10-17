-- Geri alma: bu pistlerde yarış varsa durur (yarış kaydı silinmez).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM races WHERE track_id IN (
    '6d0c8a0e-1b11-4c51-9a01-000000000006', '6d0c8a0e-1b11-4c51-9a01-000000000007', '6d0c8a0e-1b11-4c51-9a01-000000000008')) THEN
    RAISE EXCEPTION '0098 geri alınamaz: uluslararası pistlerde yarış kaydı var.';
  END IF;
END $$;
DELETE FROM tracks WHERE id IN (
  '6d0c8a0e-1b11-4c51-9a01-000000000006', '6d0c8a0e-1b11-4c51-9a01-000000000007', '6d0c8a0e-1b11-4c51-9a01-000000000008');
