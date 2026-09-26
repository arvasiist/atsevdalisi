-- Telemetri zenginleştirme — `RaceSegmentSnapshot.fatigueLevel` ve
-- `.paceScore` (bkz. `packages/shared-types/src/race.ts`'teki doc yorumları).
--
-- NEDEN İKİ AYRI SÜTUN, MEVCUT `fatigue` SÜTUNUNU DEĞİŞTİRMEK YERİNE:
-- mevcut `fatigue` sütunu `horses.fatigue`'ın — yani `race_entries.
-- horse_snapshot` ile donmuş YARIŞ ÖNCESİ STATİK değerin — segment başına
-- kopyasıdır (`race-engine.ts`'teki `fatigue: entry.fatigue`). Motorun
-- yarış İÇİNDE segment segment BİRİKTİRDİĞİ dinamik değer
-- (`state.runtimeFatigue`, `domain/race/fatigue.ts`) ise bugüne kadar HİÇ
-- kalıcılaştırılmıyordu — bu yüzden istemcideki yorgunluk göstergesi
-- (`RaceHud`'un "Yor" çubuğu) yarış boyunca SABİT kalıyordu. İkisi
-- `domain/race/fatigue.ts`'in kendi doc yorumunda açıkça
-- "KARIŞTIRILMAMALIDIR" denen AYRI mekanizmalardır; bu yüzden mevcut sütun
-- KORUNUR ve dinamik değer YENİ bir sütuna yazılır.
--
-- BİLEREK NULLABLE (DEFAULT yok): bu alanlar `RaceSegmentSnapshot`'ta da
-- opsiyoneldir. Bu sütunlar eklenmeden ÖNCE persist edilmiş yarış kayıtları
-- NULL taşır ve tüketiciler `fatigueLevel ?? fatigue` geri düşüşünü
-- kullanır (bkz. `apps/web/src/features/race-viewer/timeline-playback.ts`).
-- Bu, migration 0014'ün aksine NOT NULL DEFAULT gerektirmez — orada eski
-- satırlar için anlamlı bir varsayılan vardı (bloklanma YOK, karar YOK).
--
-- Tip, aynı tablodaki `stamina`/`fatigue` sütunlarıyla AYNI NUMERIC(5,2)
-- 0-100 ölçeğidir: `fatigueLevel` zaten 0..`raceConfig.fatigue.
-- maxRuntimeFatigue` (100) aralığında, `paceScore` ise 0-100'e kırpılır.
ALTER TABLE race_entry_segments
  ADD COLUMN fatigue_level NUMERIC(5,2),
  ADD COLUMN pace_score    NUMERIC(5,2);

COMMENT ON COLUMN race_entry_segments.fatigue_level IS 'Yarış İÇİNDE biriken dinamik yorgunluk (0-100); `fatigue` sütunundan (yarış ÖNCESİ statik değer) FARKLIDIR — bkz. domain/race/fatigue.ts';
COMMENT ON COLUMN race_entry_segments.pace_score IS 'Bu segmentteki tempo göstergesi (0-100, 50 = nötr); pace.staminaConsumptionMultiplier''ın yüzdeye çevrilmiş hali';
