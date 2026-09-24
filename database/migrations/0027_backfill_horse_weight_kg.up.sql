-- R4 — Carried Weight, SADECE at vücut ağırlığı alt-faktörü (hardening-
-- realism-master-plan.md §26) — bkz. apps/api/src/domain/horse/weight.ts,
-- apps/api/src/domain/horse/horse.ts (`createStarterHorse`), apps/api/src/
-- domain/breeding/breeding.ts (`breedHorses`), apps/api/src/domain/race/
-- carried-weight.ts doc yorumları.
--
-- `horses.weight_kg` (migration 0002) bu turdan ÖNCE HİÇBİR gerçek kod
-- yolu tarafından doldurulmuyordu (`createStarterHorse` her zaman `null`
-- yazıyordu, breeding/market akışları bu alana hiç dokunmuyordu) — bu
-- yüzden bu turdan ÖNCE oluşturulmuş TÜM atların `weight_kg`'si NULL'dır.
-- `createStarterHorse`/`breedHorses` ARTIK gerçek, çeşitlilik gösteren bir
-- ağırlık üretiyor (bkz. o dosyaların doc yorumu) — bu migration, bu
-- değişiklikten ÖNCE oluşturulmuş atları da GERİYE DÖNÜK olarak backfill
-- eder (migration 0026'nın `horse_surface_stats`/`horse_distance_stats`
-- backfill'iyle AYNI desen: "satırı/değeri olmayan HER at için gerçekçi
-- bir varsayılan doldurulur").
--
-- Gerçek bir normal dağılım fonksiyonu Postgres'te yerleşik olmadığından,
-- `domain/horse/weight.ts`'teki `generateBellCurveWeightKg`'nin TS
-- tarafındaki AYNI Irwin-Hall/Bates (n=3) yaklaşımı burada SQL'e çevrilir:
-- üç bağımsız `random()` çağrısının ortalaması [0,1) aralığında bir
-- Bates(3) örneklemi verir (ortalama 0.5, std sapma ≈ 1/6 ≈ 0.1667). Bu,
-- nüfus ortalaması 495 kg ve hedef std sapma ~25 kg (`HORSE_WEIGHT_
-- POPULATION_MEAN_KG`/`STARTER_HORSE_WEIGHT_STD_DEV_KG` ile AYNI) olacak
-- şekilde `(avg - 0.5) * (25 * 6)` = `(avg - 0.5) * 150` ile ölçeklenir,
-- sonra [430, 580] aralığına (`HORSE_WEIGHT_MIN_KG`/`HORSE_WEIGHT_MAX_KG`)
-- clamp edilip 1 ondalığa yuvarlanır. Her satır İÇİN üç BAĞIMSIZ `random()`
-- çağrısı yapılır (yani her at GERÇEKTEN farklı, çeşitlilik gösteren bir
-- değer alır — sabit/tekrarlayan bir değer DEĞİL).
UPDATE horses
SET weight_kg = ROUND(
  LEAST(580, GREATEST(430,
    495 + (((random() + random() + random()) / 3.0) - 0.5) * 150
  ))::numeric,
  1
)
WHERE weight_kg IS NULL;

-- migration 0022/0026'nın "belgeleme" migration'ı kalıbıyla AYNI: bir
-- DBA/denetçi `\d+ horses` ile doğrudan şemayı incelediğinde GÜNCEL
-- durumu (sütun artık gerçekten wiring edilmiş) görsün diye sütun yorumu
-- eklenir.
COMMENT ON COLUMN horses.weight_kg IS 'WIRING EDILDI (R4 - Carried Weight, sadece at vucut agirligi alt-faktoru): createStarterHorse/breedHorses HER yeni/tay at icin gercek, cesitlilik gosteren bir deger uretir (migration 0027 mevcut atlari da backfill etti); Race Engine weightCompatibility''i apps/api/src/domain/race/carried-weight.ts computeWeightCompatibility ile bu sutundan turetir (bkz. entrant-snapshot.ts). Jokey/handikap/ekipman agirligi alt-faktorleri bilincli olarak kapsam disi (bkz. carried-weight.ts doc yorumu).';
