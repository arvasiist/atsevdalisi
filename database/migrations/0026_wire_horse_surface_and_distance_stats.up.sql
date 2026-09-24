-- R3 — Track Fit (bu turda EKLENDİ) — bkz. apps/api/src/domain/race/
-- entrant-snapshot.ts, apps/api/src/domain/race/track-fit.ts doc
-- yorumları, apps/api/src/infrastructure/horse/postgres-horse.repository.ts
-- save() (bu turda güncellendi).
--
-- `PostgresHorseRepository.save()` artık YENİ oluşturulan HER at için
-- `horse_surface_stats`/`horse_distance_stats` satırlarını da ekliyor
-- (`horse_stats`/`horse_health` ile AYNI desen). Ama bu değişiklikten
-- ÖNCE oluşturulmuş atların bu satırları YOK — bu yüzden burada GERİYE
-- DÖNÜK bir backfill yapılır: satırı olmayan HER at için varsayılan
-- (DEFAULT 50) bir satır eklenir. Bu, hiçbir atın davranışını DEĞİŞTİRMEZ
-- (DEFAULT değerler zaten nötr 50'dir — `entrant-snapshot.ts`'in bu
-- turdan ÖNCEKİ sabit nötr davranışıyla AYNI) — yalnızca "her at bu
-- satırlara sahip olmalıdır" değişmezini (invariant) TÜM mevcut atlar
-- için de GERÇEK kılar (`horse_stats`/`horse_health`'in ZATEN sahip
-- olduğu garanti — bkz. `postgres-horse.repository.ts` üst doc yorumu).
INSERT INTO horse_surface_stats (horse_id)
SELECT h.id FROM horses h
WHERE NOT EXISTS (SELECT 1 FROM horse_surface_stats s WHERE s.horse_id = h.id);

INSERT INTO horse_distance_stats (horse_id)
SELECT h.id FROM horses h
WHERE NOT EXISTS (SELECT 1 FROM horse_distance_stats d WHERE d.horse_id = h.id);

-- migration 0022'nin "TASARLANDI ama HENÜZ WIRING EDİLMEDİ" notu ARTIK
-- GEÇERSİZ — bir DBA/denetçi `\d+ horse_surface_stats` ile doğrudan
-- şemayı incelediğinde GÜNCEL durumu görsün diye metin güncellenir
-- (`COMMENT ON TABLE` "belgeleme" migration'ı kalıbı, 0022 ile AYNI).
COMMENT ON TABLE horse_surface_stats IS 'WIRING EDILDI (R3 - Track Fit): PostgresHorseRepository.save() HER yeni at icin varsayilan (DEFAULT 50) bir satir ekler (migration 0026 mevcut atlari da backfill etti); Race Engine surfaceCompatibility''i apps/api/src/domain/race/track-fit.ts computeSurfaceCompatibility ile bu tablodan turetir (bkz. entrant-snapshot.ts TrackFitInput).';

COMMENT ON TABLE horse_distance_stats IS 'WIRING EDILDI (R3 - Track Fit): PostgresHorseRepository.save() HER yeni at icin varsayilan (DEFAULT 50) bir satir ekler (migration 0026 mevcut atlari da backfill etti); Race Engine distanceCompatibility''i apps/api/src/domain/race/track-fit.ts computeDistanceCompatibility ile bu tablodan turetir (bkz. entrant-snapshot.ts TrackFitInput).';
