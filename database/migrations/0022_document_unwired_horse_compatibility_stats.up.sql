-- AUDIT_AND_HARDENING Öncelik 8 (bu oturum) — bkz. `apps/api/src/domain/
-- race/entrant-snapshot.ts` `UNMODELED_SNAPSHOT_FIELDS` doc yorumu.
--
-- `horse_surface_stats`/`horse_distance_stats` (migration 0003) TAM
-- OLARAK zemin/mesafe uyumu için tasarlanmış tablolardır, ama
-- `PostgresHorseRepository.save()` bunlara HİÇBİR ZAMAN satır eklemez —
-- `horse_stats`/`horse_health`'in AKSİNE, bir at oluşturulduğunda bu iki
-- tabloda HİÇBİR satır yoktur. Race Engine bu yüzden sabit nötr (50)
-- değer kullanır (`entrant-snapshot.ts`). Bu, bir HATA değil bilinçli bir
-- kapsam kararıdır (tam scout/keşif mekaniği brief §34 kapsamında YENİ
-- BİR ÖZELLİK olurdu) — ama denetim, bunun "sessizce sonsuza kadar nötr
-- varsayma" riski taşıdığını (Mutlak Kural 4) tespit etti. Bu yorumlar,
-- bir geliştiricinin/denetçinin KAYNAK KODUNA HİÇ BAKMADAN, doğrudan
-- veritabanı şemasını inceleyerek (`\d+ horse_surface_stats`) bu gapı
-- görmesini sağlar.
COMMENT ON TABLE horse_surface_stats IS 'TASARLANDI ama HENÜZ WIRING EDİLMEDİ: PostgresHorseRepository.save() bu tabloya HİÇBİR ZAMAN satır eklemez (horse_stats/horse_health''in AKSİNE) — Race Engine surfaceCompatibility için sabit nötr (50) kullanır, bkz. apps/api/src/domain/race/entrant-snapshot.ts UNMODELED_SNAPSHOT_FIELDS (AUDIT_AND_HARDENING Öncelik 8)';

COMMENT ON TABLE horse_distance_stats IS 'TASARLANDI ama HENÜZ WIRING EDİLMEDİ: PostgresHorseRepository.save() bu tabloya HİÇBİR ZAMAN satır eklemez (horse_stats/horse_health''in AKSİNE) — Race Engine distanceCompatibility için sabit nötr (50) kullanır, bkz. apps/api/src/domain/race/entrant-snapshot.ts UNMODELED_SNAPSHOT_FIELDS (AUDIT_AND_HARDENING Öncelik 8)';
