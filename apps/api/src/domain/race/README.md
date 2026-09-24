# domain/race

Race Engine — brief §6, §15-25; bkz. `docs/RACE_ENGINE.md` ve
`docs/ALGORITHMS.md` §2-8.

- `base-ability.ts` — `computeBaseAbility` (BaseAbility formülü, §2);
  `trackCompatibility` terimi artık gerçek veriden besleniyor (bkz.
  `track-fit.ts`, R3 — Track Fit); `carriedWeight` terimi de artık gerçek
  veriden besleniyor (bkz. `carried-weight.ts`, R4 — Carried Weight,
  aşağıdaki "Carried Weight" bölümü).
- `distance-category.ts` — `getDistanceCategory`, `applyDistanceWeightAdjustments` (§8).
- `environment.ts` — `getEnvironmentModifier` (zemin/hava, §7).
- `pace.ts` — `derivePaceEffect` (önde git/geriden gel, §5).
- `track-fit.ts` — R3 — Track Fit (bu turda EKLENDİ):
  `computeSurfaceCompatibility`/`computeDistanceCompatibility`, `horse_
  surface_stats`/`horse_distance_stats`'ı (migration 0003/0026) bir
  yarışın zemin/mesafesine göre TEK bir uyum puanına indirger.
- `carried-weight.ts` — R4 — Carried Weight, SADECE at vücut ağırlığı
  alt-faktörü (bu turda EKLENDİ): `computeWeightCompatibility`, `horses.
  weight_kg`'yi (migration 0002/0027) 0-100 arası bir uyumluluk puanına
  indirger. Detay için aşağıdaki "Carried Weight" bölümüne bakınız.
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
  TRAIT_SCORE` (50) — henüz wiring edilmemiş TEK alan (`jockeySkillComposite`)
  için kalır; `surfaceCompatibility`/`distanceCompatibility` R3 — Track Fit
  (bu turda TAMAMLANDI) ile artık `horse_surface_stats`/`horse_distance_stats`
  tablolarından (migration 0003/0026) gerçek veriyle besleniyor — bkz.
  `track-fit.ts` ve bu dosyanın `TrackFitInput`/`UNMODELED_SNAPSHOT_FIELDS`
  doc yorumları.
- `bot-generator.ts` — `generateBotEntrants`: gerçek çok oyunculu
  eşleştirme (FAZ 7) henüz wiring edilmediğinden, deterministik (`createSeededRandom`)
  yapay zeka rakipler üretir.
- `validation.ts` — taktik alanları (`RACING_STYLES` vb.) ve
  `PRACTICE_RACE_BOT_COUNT`/`PRACTICE_RACE_DISTANCE_METERS` sabitleri.
- `errors.ts` — `InvalidRaceTacticError`.

Testler: `apps/api/test/domain/race/race-engine.spec.ts` (determinism +
denge testleri, brief §53), `entrant-snapshot.spec.ts`, `bot-generator.spec.ts`,
`track-fit.spec.ts` (R3 — Track Fit, bu turda EKLENDİ).

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
  **İki turlu bir CI serüveni sonunda CI #130'da tam yeşil doğrulandı:**
  CI #128 kırmızı çıktı (Fisher-Yates takas satırındaki `noUncheckedIndexedAccess`
  kaynaklı `string | undefined` derleme hatası — bu sandbox'ta gerçek
  `tsc`'nin hiç çalıştırılamamasından dolayı push ÖNCESİ `tsx`-tabanlı
  doğrulamanın YAKALAYAMADIĞI bir tip hatasıydı), `readIndexOrThrow` ile
  düzeltildi (bkz. `gate-assignment.ts`'in kendi doc yorumu — `!` tip
  zorlaması DEĞİL, gerçek bir çalışma zamanı kontrolü). Ardından CI #129
  YİNE kırmızı çıktı — bu kez `gate-assignment.ts`'te DEĞİL,
  `postgres-race.repository.ts`'in `insertEntryWithSegments`'inde
  (pratik yarış + PvP'nin PAYLAŞTIĞI TEK ortak INSERT): `gate_position`
  SQL'de `jockey_id` ile AYNI satırda hardcoded `NULL` yazılıyordu (Draw
  eklenirken YANLIŞLIKLA güncellenmemiş eski bir yer tutucu) — yani
  `entry.gatePosition` doğru hesaplanıyordu ama DB'ye hiç YAZILMIYORDU;
  bu sandbox'ın Postgres'i hiç çalıştıramamasından kaynaklanan somut bir
  push-öncesi doğrulama sınırı örneği. `gate_position` gerçek bir SQL
  parametresine çevrilerek düzeltildi (commit `6e3cac3`).**

## Carried Weight (at vücut ağırlığı) — sadece body-weight alt-faktörü (bu turda EKLENDİ)

Master Plan §26 (hardening-realism-master-plan.md), Carried Weight'i DÖRT
alt-faktöre ayırır: "horse body weight, jockey weight, assigned weight,
equipment weight [...] acceleration/stamina consumption/final speed
üzerinden küçük ve kontrollü etki yapsın". Bu turda yalnızca BİRİNCİSİ
(at vücut ağırlığı) uçtan uca, gerçek ve çalışan bir özelliğe dönüştürüldü:

**Yapıldı:**
- `horses.weight_kg` (migration 0002, nullable NUMERIC(6,2)) bu turdan
  ÖNCE hiçbir gerçek kod yolu tarafından doldurulmuyordu (`createStarterHorse`
  hep sabit `null` yazıyordu, breeding hiç dokunmuyordu).
- `domain/horse/weight.ts` — `generateBellCurveWeightKg`: bağımsız üç
  tekdüze ([0,1)) örnekten (Irwin-Hall/Bates n=3 yaklaşımı) gerçekçi,
  çeşitlilik gösteren bir ağırlık (kg) üretir. Nüfus ortalaması 495kg,
  gerçekçi sınırlar [430, 580]kg.
- `domain/horse/horse.ts` — `createStarterHorse` artık `generateStarterHorseWeightKg`
  ile üretilmiş GERÇEK bir `weightKg` alır (std sapma ~25kg, nüfus
  genelinin doğal varyansı); `NewStarterHorseInput.weightKg` OPSİYONEL
  DEĞİLDİR (domain katmanı `Math.random()` çağıramadığı için çağıran
  taraf — `RegisterPlayerUseCase`/`LoginWithProviderUseCase` — bu değeri
  açıkça üretip geçirir).
- `domain/breeding/breeding.ts` — `breedHorses` artık `foalWeightKg`
  döner: iki ebeveynin ağırlığının ortalaması + DAHA DAR bir varyans
  (`FOAL_WEIGHT_STD_DEV_KG`, ~15kg — soy, doğal varyansı daraltır).
  Ebeveynlerden birinin `weightKg`'si `null` ise (eski/legacy veri) nüfus
  ortalaması (495kg) `!` non-null assertion KULLANILMADAN, gerçek bir
  `??` guard'ıyla yedek değer olarak kullanılır.
- `database/migrations/0027_backfill_horse_weight_kg` — bu değişiklikten
  ÖNCE oluşturulmuş (`weight_kg IS NULL`) TÜM atları AYNI dağılım
  yaklaşımının SQL'e çevrilmiş hâliyle (`random()` üç kez) geriye dönük
  doldurur (migration 0026'nın `horse_surface_stats`/`horse_distance_stats`
  backfill'iyle AYNI desen — down migration'ı da AYNI "geri alınamaz,
  veri silinmez" konvansiyonunu izler).
- `carried-weight.ts` — `computeWeightCompatibility(weightKg)`: ideal
  aralık [470, 520]kg (merkez 495) içinde yüksek puan (95-100), dışına
  çıkıldıkça SİMETRİK üstel sönümlemeyle düşen ama ASLA `FLOOR_SCORE`'a
  (20) ULAŞMAYAN (yalnızca yaklaşan) bir puan — `track-fit.ts`'in "sert
  bir eşiğe/0'a asla düşme" ilkesiyle AYNI. `weightKg === null` ise nötr
  50 döner (`surfaceCompatibility`/`distanceCompatibility` ile AYNI
  "bilinmiyorsa nötr" ilkesi).
- `entrant-snapshot.ts` — `RaceEntrantSnapshot.weightCompatibility`,
  `buildHorseEntrantSnapshot`'a YENİ bir parametre/DB sorgusu GEREKMEDEN
  eklendi (`horse.weightKg` zaten `Horse` aggregate'inde mevcuttu).
  `UNMODELED_SNAPSHOT_FIELDS`'ta HİÇ YER ALMADI (`jockeySkillComposite`'in
  aksine, bu alan HİÇBİR ZAMAN "sahte" bir nötr değer değildi).
- `race.config.json`'ın `baseAbilityWeights`'ine `carriedWeight: 0.05`
  eklendi; `tactic` ağırlığı `0.10`'dan `0.05`'e düşürüldü (bkz. aşağıdaki
  gerekçe) — toplam HÂLÂ tam `1.00`.
- `base-ability.ts` — `computeBaseAbility`'ye `snapshot.weightCompatibility
  * weights.carriedWeight` terimi eklendi.

**`tactic` ağırlığının düşürülme gerekçesi:** `base-ability.ts`'teki
`tactic` bileşeni (`NEUTRAL_TACTIC_SCORE`) HER at için HER ZAMAN sabit
`50` döner — kodda hiçbir varyans yoktur (dinamik taktik etkisi zaten
Pace/Overtaking sistemleri üzerinden AYRICA modellenir, bkz. `base-ability.ts`'in
kendi doc yorumu). Bu doğrulandıktan SONRA `tactic`'in `0.10`'luk
bütçesinin yarısı (`0.05`) `carriedWeight`'e aktarıldı — bu, BaseAbility'nin
GERÇEK varyansını artırdı (sabit bir terimin ağırlığını azaltıp gerçek bir
sinyalin ağırlığını artırdı), önceki davranışı BOZMADI.

**BİLİNÇLİ olarak kapsam dışı (Master Plan §26'nın diğer ÜÇ alt-faktörü):**
- **jockey weight (jokey ağırlığı):** projede gerçek bir jokey-ATAMA akışı
  yok (pratik yarışta `race_entries.jockey_id` her zaman `NULL` —
  `jockeySkillComposite` HÂLÂ nötr, bkz. yukarıdaki "AUDIT_AND_HARDENING"
  bölümü). Bu, ayrı ve daha büyük bir dilimi hak eder.
- **assigned/handikap weight (atanmış ağırlık):** projede bir yarış
  SINIFI/handikap reytingi sistemi YOK — bu ağırlığın dayanacağı bir
  mekanizma hiç var olmadığından, modellemesi YENİ BİR ÖZELLİK icat etmek
  olurdu (kapsam dışı, proje sahibinin kararı gerektirir).
- **equipment weight (ekipman ağırlığı):** projede ekipman/gear envanteri
  kavramı YOK.

Bu üçünü tek bir sayıda "tahmin ederek" birleştirmek YENİ bir denge kararı
(ve sahte veri) olurdu — bu yüzden `computeWeightCompatibility` yalnızca
gerçek, veritabanında var olan `weight_kg` girdisini kullanır (bkz.
`carried-weight.ts`'in kendi doc yorumu, daha ayrıntılı gerekçe için).

Testler: `apps/api/test/domain/race/carried-weight.spec.ts`,
`apps/api/test/domain/race/entrant-snapshot.spec.ts` (wiring),
`apps/api/test/domain/race/race-engine-field-balance.spec.ts` (uç
ağırlıkların galibiyeti dejenere etmediğini doğrulayan R4 senaryosu),
`apps/api/test/domain/horse/horse.spec.ts` (`generateStarterHorseWeightKg`),
`apps/api/test/domain/breeding/breeding.spec.ts` (`foalWeightKg`).
