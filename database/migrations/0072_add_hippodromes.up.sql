-- 0072 — HİPODROMLAR (08.10.2026, sahibinin isteği: "sadece Veliefendi değil
-- başka koşu alanları da"). `tracks` tablosu 0002'den beri vardı ama HİÇ satırı
-- yoktu ve `races.track_id` hep NULL'dı. Artık beş hipodrom bir ANAHTARLA
-- (`track_key`) kayıtlı; kimlik + anahtar `config/hippodromes.config.json` ile
-- BİREBİR aynıdır (`hippodromes.spec.ts` bu dosyayı okuyarak karşılaştırır).
-- Yalnızca ekleme: mevcut yarışlara dokunulmaz (NULL = varsayılan hipodrom).
ALTER TABLE tracks ADD COLUMN track_key TEXT;
ALTER TABLE tracks ADD CONSTRAINT tracks_track_key_uq UNIQUE (track_key);

INSERT INTO tracks (id, track_key, name, location, length_m, turn_count, track_width_m) VALUES
  ('6d0c8a0e-1b11-4c51-9a01-000000000001', 'veliefendi', 'Veliefendi Hipodromu', 'İstanbul', 2000, 2, 20.00),
  ('6d0c8a0e-1b11-4c51-9a01-000000000002', 'ankara', 'Ankara 75. Yıl Hipodromu', 'Ankara', 1800, 2, 20.00),
  ('6d0c8a0e-1b11-4c51-9a01-000000000003', 'izmir', 'İzmir Şirinyer Hipodromu', 'İzmir', 1900, 2, 20.00),
  ('6d0c8a0e-1b11-4c51-9a01-000000000004', 'adana', 'Adana Yeşiloba Hipodromu', 'Adana', 1800, 2, 20.00),
  ('6d0c8a0e-1b11-4c51-9a01-000000000005', 'bursa', 'Bursa Osmangazi Hipodromu', 'Bursa', 1700, 2, 20.00)
ON CONFLICT (id) DO NOTHING;

COMMENT ON COLUMN tracks.track_key IS 'Hipodrom anahtarı (config/hippodromes.config.json → key); 3D sahne teması buradan seçilir.';
