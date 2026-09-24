-- `COMMENT ON TABLE`'ı migration 0022'nin ORİJİNAL metnine geri döndürür
-- (0022'nin kendi `.down.sql`'i ile AYNI hedef metin).
--
-- Backfill edilen satırlar BİLEREK SİLİNMEZ: bunlar DEFAULT (nötr 50)
-- değerli, zararsız satırlardır — TAM OLARAK yeni bir atın `save()`
-- çağrıldığında ZATEN alacağı satırlarla AYNI. Bu satırları geri almak
-- (down migration'ı "veri kaybı" haline getirmeden) hiçbir pratik fayda
-- sağlamaz; `horse_stats`/`horse_health` gibi diğer "her at sahip olmalı"
-- tablolarının down migration'ları da benzer şekilde veri SİLMEZ.
COMMENT ON TABLE horse_surface_stats IS 'TASARLANDI ama HENÜZ WIRING EDİLMEDİ: PostgresHorseRepository.save() bu tabloya HİÇBİR ZAMAN satır eklemez (horse_stats/horse_health''in AKSİNE) — Race Engine surfaceCompatibility için sabit nötr (50) kullanır, bkz. apps/api/src/domain/race/entrant-snapshot.ts UNMODELED_SNAPSHOT_FIELDS (AUDIT_AND_HARDENING Öncelik 8)';

COMMENT ON TABLE horse_distance_stats IS 'TASARLANDI ama HENÜZ WIRING EDİLMEDİ: PostgresHorseRepository.save() bu tabloya HİÇBİR ZAMAN satır eklemez (horse_stats/horse_health''in AKSİNE) — Race Engine distanceCompatibility için sabit nötr (50) kullanır, bkz. apps/api/src/domain/race/entrant-snapshot.ts UNMODELED_SNAPSHOT_FIELDS (AUDIT_AND_HARDENING Öncelik 8)';
