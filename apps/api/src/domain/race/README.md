# domain/race

Race Engine — brief §6, §15-25; bkz. `docs/RACE_ENGINE.md` ve
`docs/ALGORITHMS.md` §2-8.

- `base-ability.ts` — `computeBaseAbility` (BaseAbility formülü, §2).
- `distance-category.ts` — `getDistanceCategory`, `applyDistanceWeightAdjustments` (§8).
- `environment.ts` — `getEnvironmentModifier` (zemin/hava, §7).
- `pace.ts` — `derivePaceEffect` (önde git/geriden gel, §5).
- `race-engine.ts` — `simulateRace`: segment bazlı simülasyon (§4),
  controlled randomness (§3, seed'e bağlı), overtaking/bloklanma (§6).
  Server-authoritative ve deterministiktir: aynı `simulationSeed` + aynı
  `entries` + aynı config → bit bit aynı `RaceTimeline`.

**Kapsam dışı (FAZ 5'e bırakıldı):** kulvar/boşluk bazlı gerçek overtaking
modeli, 7 aşamalı ayrıntılı jokey AI karar ağacı, "neden kazandım/
kaybettim" açıklaması (`docs/RACE_ENGINE.md` §8-9).

## FAZ 1 wiring, sekizinci dilim — Pratik Yarış (bu oturum)

`simulateRace`'i gerçek bir `Horse`/`HorseStats`'a bağlayan orkestrasyon
(bkz. `application/use-cases/run-practice-race.use-case.ts`):

- `entrant-snapshot.ts` — `buildHorseEntrantSnapshot`: bir oyuncu atını
  `RaceEntrantSnapshot`'a çevirir; `assertValidRaceTactic` taktik
  alanlarını BAĞIMSIZ doğrular (bkz. `errors.ts`). `NEUTRAL_UNMODELED_
  TRAIT_SCORE` (50) — henüz wiring edilmemiş alanlar (surface/distance
  uyumu, jokey) için; bkz. dosya içi "BULUNAN ama KAPSAM DIŞI" notu
  (`horse_surface_stats`/`horse_distance_stats` tabloları VAR ama hiç
  doldurulmuyor — ayrı bir dilimi hak ediyor).
- `bot-generator.ts` — `generateBotEntrants`: gerçek çok oyunculu
  eşleştirme (FAZ 7) henüz wiring edilmediğinden, deterministik (`createSeededRandom`)
  yapay zeka rakipler üretir.
- `validation.ts` — taktik alanları (`RACING_STYLES` vb.) ve
  `PRACTICE_RACE_BOT_COUNT`/`PRACTICE_RACE_DISTANCE_METERS` sabitleri.
- `errors.ts` — `InvalidRaceTacticError`.

Testler: `apps/api/test/domain/race/race-engine.spec.ts` (determinism +
denge testleri, brief §53), `entrant-snapshot.spec.ts`, `bot-generator.spec.ts`.

## FAZ 1 wiring, dokuzuncu dilim — Giriş ücreti + ödül (bu oturum)

`run-practice-race.use-case.ts`'e giriş ücreti + ödül eklendi (brief §31
Economy, docs/SECURITY.md §5):

- `prize.ts` — `getPracticeRaceEntryFee`/`getPracticeRacePrize`: SAF
  fonksiyonlar, `config/economy.config.json`'daki YENİ `practiceRace`
  bloğunu (`baseEntryFee`, `prizeByFinishPosition`) ve önceden hazır ama
  hiç kullanılmamış `raceEntryFeeMultiplier`'ı kullanır. AYRICA
  `applyPracticeRaceStakes` — CI'da bulunan bir hatanın (son sırayı
  bitiren oyuncu için `credit(..., 0, ...)`'ın `wallet.ts`'in sıfır
  miktar kuralına takılıp 500 döndürmesi) düzeltilmiş hali; miktar SIFIR
  olduğunda `debit`/`credit` hiç çağrılmaz.

Bakiye değişikliği (debit+credit) `PlayerRepository.updateWithLock` İÇİNDE,
`UpgradeStableUseCase` ile AYNI desende uygulanır — bkz. use-case'in kendi
doc yorumu. Bu, brief §54'ün Idempotency-Key + Redis altyapısının İLK
gerçek kullanıcısıdır (bkz. `api/idempotency/idempotency.interceptor.ts`,
`app.module.ts`'e artık bağlı olan `RedisModule`).

## FAZ 1 wiring, on dördüncü dilim — PvP Eşleştirme'nin Race Engine kullanımı (bu oturum)

`domain/online/`'daki (brief §41 ONLINE MİMARİ) yeni `JoinMatchmakingQueueUseCase`,
İKİ GERÇEK oyuncunun atını `buildHorseEntrantSnapshot`'la (yukarıda) bir
snapshot'a çevirip AYNI `simulateRace`'i çağırır — bu dosyanın kendisinde
HİÇBİR değişiklik YOKTUR, `domain/online/README.md`'nin "YENİ bir
simülasyon motoru YAZILMADI" notuyla BİREBİR tutarlıdır. Botların (bu
diliminin `bot-generator.ts`'i) AKSİNE, PvP'de İKİ taraf da gerçek `horses`/
`race_entries` satırlarına sahiptir (bkz. `RaceRepository.
savePvpMatchWithRatings` — AUDIT_REPORT.md Bulgu E1'in PvP analogu, bu
oturum: Elo reyting güncellemesi ile yarış/maç kaydı artık TEK atomik
transaction'da yazılır; eski `savePvpMatch` bu yoldan ARTIK ÇAĞRILMIYOR).

## AUDIT_AND_HARDENING (bu oturum) — Öncelik 4/6/8

Üç ayrı sertleştirme bu dizini etkiledi (tam detay için `docs/ROADMAP.md`
AUDIT_AND_HARDENING bölümüne bakınız):

- **Öncelik 4 (versioning):** `race-engine.ts`'e `RACE_ENGINE_VERSION`/
  `RACE_RULESET_VERSION` sabitleri eklendi; her `Race` nesnesi artık
  bunları + `config/race.config.json`'ın kendi `version`'ını taşır
  (persist edilirken `races.engine_version`/`ruleset_version`/
  `config_version`'a yazılır, migration 0021).
- **Öncelik 6 (denge/gerçekçilik):** segment skoru artık `modifier-
  combination.ts`'teki SINIRLI ceza-toplama ile hesaplanır (kontrolsüz
  çarpımsal yığılma YOK); `pace.ts`'teki "final düzlük" artık
  `computeFinalStretchFraction` ile pist mesafesine duyarlı (eskiden
  sabit `0.75` oranıydı). Bu formül değişikliği yüzünden
  `RACE_RULESET_VERSION` `1.0.0` → `1.1.0`.
- **Öncelik 8 (surface/distance stats):** `entrant-snapshot.ts`'teki
  `horse_surface_stats`/`horse_distance_stats` wiring eksikliği artık
  `UNMODELED_SNAPSHOT_FIELDS` ile PROGRAMATİK olarak görünür (bir
  "tripwire" testiyle korunur) — bkz. o dosyanın doc yorumu.
- **AUDIT_REPORT.md Bulgu R3 (bu oturum):** `form` alanı `UNMODELED_
  SNAPSHOT_FIELDS`'tan ÇIKARILDI — artık `deriveFormFromRecentResults`
  ile atın kendi son `FORM_SAMPLE_SIZE` (5) sonuçlanmış yarışının
  `performance_score` ortalamasından hesaplanıyor (`RaceRepository.
  findRecentResultsByHorseId`, yeni). `surfaceCompatibility`/
  `distanceCompatibility`/`jockeySkillComposite` HÂLÂ kapsam dışı
  (yukarıdaki Öncelik 8 notuyla AYNI gerekçe — form'un aksine bunlar
  BAŞKA tablolara/sistemlere (scout mekaniği, Jockey FAZ 2) bağımlı).
- **AUDIT_REPORT.md Bulgu R3, ikinci alt-dilim (bu oturum):** yeni
  `gate-assignment.ts` — `RaceEntry.gatePosition` artık `assignGatePositions`
  ile gerçek bir çekilişten türetiliyor (`race_entries.gate_position`
  sütunu migration 0006'dan beri vardı ama hiç doldurulmuyordu). BİLİNÇLİ
  olarak `race-engine.ts`'in DIŞINDA, simülasyon TAMAMEN bittikten SONRA
  çağrılır — `RACE_ENGINE_VERSION`/`RACE_RULESET_VERSION` DEĞİŞMEDİ, yarış
  SONUCUNA hiçbir etkisi YOK (bkz. o dosyanın "Tasarım kararı" doc yorumu:
  `config.lanes.count` yarış stili sayısına tam eşit olduğundan, Draw'ı
  kulvar atamasına bağlamak T3b'nin öğrettiği risk sınıfında kapsamlı bir
  Monte Carlo yeniden dengeleme gerektirirdi — bilinçli olarak ertelendi).
