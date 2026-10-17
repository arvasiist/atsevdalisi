-- 0098 — ULUSLARARASI HİPODROMLAR (16.10.2026, brief §9). Yalnızca ekleme:
-- üç pist (ABD, Fransa, BAE). Kimlik + anahtar `config/hippodromes.config.json`
-- ile BİREBİR (`hippodromes.spec.ts` 0072 + 0098'i okur). Adlar ŞEHİR/BÖLGE
-- adıdır: gerçek tesislerin markalı adları (Churchill Downs, ParisLongchamp,
-- Meydan) kullanım hakkı doğrulanmadan oyunda GÖSTERİLMEZ (bkz. MASTER_STATUS).
INSERT INTO tracks (id, track_key, name, location, length_m, turn_count, track_width_m) VALUES
  ('6d0c8a0e-1b11-4c51-9a01-000000000006', 'kentucky', 'Kentucky Hipodromu', 'Louisville, ABD', 1609, 2, 24.00),
  ('6d0c8a0e-1b11-4c51-9a01-000000000007', 'paris', 'Paris Hipodromu', 'Paris, Fransa', 2400, 2, 24.00),
  ('6d0c8a0e-1b11-4c51-9a01-000000000008', 'dubai', 'Dubai Hipodromu', 'Dubai, BAE', 2400, 2, 24.00)
ON CONFLICT (id) DO NOTHING;
