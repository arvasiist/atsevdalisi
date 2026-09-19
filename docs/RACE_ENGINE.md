# RACE_ENGINE.md — Yarış Motoru Mimarisi

> Kaynak: `docs/PROJECT_BRIEF.md` §6, §15-25, §59-60, §64, §89 (İlke 2, İlke 3).
> Formüller için bkz. `docs/ALGORITHMS.md`. Bu doküman **ne zaman, hangi
> sırayla, nerede** hesaplama yapıldığını anlatır; **nasıl** hesaplandığı
> ALGORITHMS.md'dedir.

## 1. Temel felsefe (değişmez kural)

```text
Race Simulation (apps/api/src/domain/race/)
      → authoritative result
      → race timeline (segment segment)
      → apps/web Three.js renderer
      → animasyon
```

3D/görsel katman hiçbir zaman sonucu değiştiremez; sadece zaten hesaplanmış
`RaceTimeline` verisini oynatır (brief §22, §89 İlke 2). Bu, `apps/api` ve
`apps/web` arasındaki en kritik sözleşmedir ve **hiçbir koşulda ihlal
edilmez.**

## 2. Nerede çalışır?

Race Engine, `apps/api/src/domain/race/` altında **framework'ten bağımsız**
saf TypeScript olarak yazılır (NestJS importu yok). Bu şu üç yerden
çağrılabilmesini sağlar:

1. `apps/api` içindeki `SimulateRaceUseCase` (Application katmanı) —
   gerçek yarışlar için.
2. `tools/balance-simulator` — brief §83 "binlerce simülasyon" testi için,
   API'yi ayağa kaldırmadan doğrudan Race Engine'i çağırır.
3. Unit testler (`apps/api/test/domain/race/*.spec.ts`) — determinism ve
   denge testleri için (brief §53).

## 3. Girdi: RaceSimulationInput

```typescript
interface RaceSimulationInput {
  raceId: string;
  simulationSeed: string;           // brief §18 — deterministik üretim
  track: TrackConfig;                // mesafe, zemin, viraj sayısı, genişlik
  weather: WeatherConditions;        // hava, sıcaklık, rüzgar, nem
  entries: RaceEntrantSnapshot[];    // brief §56 RaceSnapshot — donmuş değerler
  config: RaceBalanceConfig;         // config/race.config.json (brief §17)
}
```

`RaceEntrantSnapshot`, atın ve jokeyin yarış anındaki **donmuş** değerlerini
içerir (brief §56). Yarış başladıktan sonra atın gerçek veritabanı kaydı
değişse bile bu snapshot değişmez — böylece oyuncu yarış sırasında
manipülasyon yapamaz.

## 4. Aşamalar (brief §16 — pipeline birebir korunmuştur)

Race Engine, yarışı 7 mantıksal aşamada işler. Her aşama, önceki aşamanın
çıktısını (pozisyon, hız, stamina, fatigue, moral) girdi olarak alır:

| Aşama | Değerlendirilen faktörler | Kaynak |
|---|---|---|
| 1. Start | `start_speed`, reaction, acceleration, jockey `start_skill`, temperament | §16 Aşama 1 |
| 2. İlk bölüm | `early_speed`, acceleration, seçilen strateji, kapı pozisyonu, jokey taktiği | §16 Aşama 2 |
| 3. Orta bölüm | stamina, pace, pozisyon, mizaç, jokey kararı, fatigue | §16 Aşama 3 |
| 4. Virajlar | agility, balance, cornering, jokey skill, kulvar pozisyonu | §16 Aşama 4 |
| 5. Son bölüm | stamina, `finish_speed`, sprint, moral, courage, fatigue | §16 Aşama 5 |
| 6. Final sprint | acceleration, sprint, kalan stamina, taktik karar, jokey skill, courage | §16 Aşama 6 |
| 7. Finish | Kesin bitiş zamanı hesaplanır | §16 Aşama 7 |

Uygulamada bu aşamalar, brief §19'daki segment sistemiyle birleştirilir:
yarış `distance / segmentLength` kadar segmente bölünür (örn. 1600m için
200m'lik 8 segment) ve her segment kendi aşamasına denk gelen ağırlıklarla
hesaplanır (bkz. `docs/ALGORITHMS.md` §4).

## 5. Çıktı: RaceTimeline

```typescript
interface RaceTimeline {
  raceId: string;
  simulationSeed: string;
  segments: RaceSegmentSnapshot[];   // her at için, her segment için telemetri
  finalResult: RaceFinishEntry[];    // brief §57 Race Result
}

interface RaceFinishEntry {
  horseId: string;
  finishPositionMs: number;   // brief §25 foto-finiş: sıralama gerçek zamandan alınır
  finishPosition: number;
  performanceScore: number;
}
```

`RaceTimeline`, hem `race_entry_segments` tablosuna persist edilir hem de
API üzerinden istemciye gönderilir; istemci bunu Three.js sahnesinde
zaman bazlı olarak oynatır (brief §22-23).

## 6. Foto-finiş (brief §25)

Sıralama **her zaman** `finishPositionMs` (gerçek simülasyon zamanı)
üzerinden belirlenir, asla 3D sahnedeki anlık render pozisyonundan değil.
İki at arasındaki fark milisaniyeler seviyesinde bile olsa (örn. 94.820s
vs 94.804s), sıralama zamana göre kesindir; 3D görüntü bu sıralamayı
takip eder, belirlemez.

**FAZ 5 notu:** tam bir berabere kalma (iki atın `cumulativeTimeMs`'i
milisaniyeye yuvarlandığında BİREBİR eşitse) için `domain/race/
race-engine.ts` açık bir ikincil karşılaştırma uygular: önce son segment
performans puanı yüksek olan önde sayılır, o da eşitse `horseId`'nin
sözlük sırasına göre — böylece "aynı seed + aynı girdi = bit bit aynı
sonuç" garantisi (§7) bu nadir uç durumda da (JS'in sort kararlılığına
GÜVENMEK yerine) açıkça korunur.

## 7. Determinism (brief §18, §53, §89)

```text
aynı simulationSeed + aynı RaceEntrantSnapshot[] + aynı RaceBalanceConfig
= aynı RaceTimeline (bit bit aynı sonuç)
```

Bu, `simulationSeed`'den türetilen bir PRNG (örn. mulberry32 veya
xorshift128 — harici bağımlılık gerektirmeyen, saf TS ile yazılabilen bir
algoritma) ile sağlanır. `Math.random()` **Race Engine içinde asla
kullanılmaz.** Her rastgele karar, `deriveRandom(seed, horseId, segmentIndex,
purpose)` gibi isim uzayına ayrılmış bir fonksiyondan üretilir; böylece:

- Aynı yarış tekrar simüle edildiğinde aynı sonuç çıkar (replay, brief §58).
- Bir atın rastgele değeri değiştirilse bile diğer atların sonucu etkilenmez
  (isim uzayı ayrımı sayesinde).

Bu kural `apps/api/test/domain/race/determinism.spec.ts` içinde test
edilir (bkz. `docs/TESTING.md`).

## 8. NPC / AI rakipler (brief §59-60)

NPC atlar rastgele üretilmez; her NPC'nin kalite, potansiyel, yarış stili,
jokey, risk profili, pist/mesafe tercihi ve formu vardır (aynı `horses` ve
`horse_stats` şemasını kullanır, sadece `owner_id` sistem/NPC hesabına
aittir).

Jokey AI karar kuralları (brief §60), Race Engine'in "orta bölüm" ve "final
sprint" aşamalarında değerlendirilir:

```text
if stamina_low:        reduce_pace()
if final_straight
   and sprint_available: push_for_finish()
if blocked:             search_overtake_lane()
if opponent_close
   and risk_allowed:    defend_position()
```

**FAZ 5'te uygulandı** — `domain/race/jockey-decisions.ts` içindeki
`decideJockeyAction`, yukarıdaki pseudocode'u BİREBİR aynı öncelik
sırasıyla uygular (aynı NPC ve oyuncu atları için, brief §84 ile tutarlı
şekilde). İlk sürüm brief'in kendi notuyla uyumlu olarak basit bir if/else
karar ağacıdır; Utility AI veya Behavior Tree'ye taşınması ileride
değerlendirilebilir (brief §60 notu). `search_overtake_lane` gerçek bir
kulvar değişimini tetikler (`domain/race/overtaking.ts` `deriveLaneChange`);
`defend_position` ise kovalayan atın geçiş olasılığını azaltan bir savunma
bonusu üretir.

**AI dengesi (brief §84):** Zorluk, NPC'ye gizli bonus vererek değil, daha
iyi at havuzu / taktik / jokey / hazırlıkla sağlanır. Race Engine formülü
NPC ve oyuncu atları için **birebir aynı** çalışır.

## 9. "Neden kazandım/kaybettim?" açıklaması (brief §85)

Race Engine, ham sayısal sonucun yanında insan-okunur bir `explanation`
üretir: en çok katkı sağlayan (pozitif) ve en çok zarar veren (negatif) 2-4
faktörü segment verisinden türetir (örn. "ilk 400m'de fazla enerji harcadı"
→ segment 1-2'de pace_modifier'ın stamina tüketimine oranı eşik üstündeyse
tetiklenir). Bu mantık `apps/api/src/domain/race/race-explanation.ts`
içinde, Race Engine'den ayrı bir saf fonksiyon olarak tutulur.

**FAZ 5'te uygulandı** — `explainRace(segments, finalResult)`, her at için
`positives`/`negatives` listeleri üretir. Kullanılan somut sezgiler: sıra
değişimi (start sırasına göre öne çıkma = pozitif, gerileme = negatif),
stamina'nın tamamen tükenmesi (negatif), 2 veya daha fazla bloklanma
denemesi (negatif) — hiç bloklanmama ise "temiz koşu" olarak pozitif — ve
herhangi bir segmentte `push_for_finish` kararı alınmışsa "final sprint"
pozitif notu. Bu fonksiyon `simulateRace`'in son adımında çağrılır ve
`RaceTimeline.explanations` alanına yazılır (bkz. §5).

## 10. Replay (brief §58)

İlk sürümde video kaydı yerine şu dörtlü saklanır:

```text
RaceSeed + RaceConfig(o anki versiyon) + HorseSnapshots + PlayerTactics
```

Replay istendiğinde Race Engine aynı girdilerle yeniden çalıştırılır ve
`RaceTimeline` yeniden üretilir (determinism sayesinde bit bit aynı çıkar).

**AUDIT_REPORT.md Bulgu R2 güncellemesi (bu oturum):** Yukarıdaki "ileride
tam telemetry cache doğrudan okunarak..." notu artık GERÇEKLEŞTİ —
`GET /races/:id/timeline` (docs/API.md), botlar DAHİL tüm katılımcıların
`race_entry_segments` telemetrisini DB'den DOĞRUDAN okuyup döner (bkz.
`RaceEntry.botLabel`, migration `0025_add_race_entry_bot_support`).
Öncesinde botlar `race_entries`'e hiç yazılmadığından (`horse_id` gerçek
bir `horses` satırına FOREIGN KEY olduğu için) tam alan replay'i YALNIZCA
bu bölümdeki "yeniden simülasyon" yoluyla mümkündü — artık İKİ yol da
(DB okuma VE yeniden simülasyon) mevcut ve determinism garantisi sayesinde
BİREBİR aynı sonucu üretir (bkz. `race-timeline.e2e-spec.ts`'teki test,
her ikisini birden çalıştırıp karşılaştırır).

**FAZ 5 notu:** Replay için ayrıca yeni kod yazılmasına gerek **yoktu** —
FAZ5'in eklediği tüm yeni alanlar (`lane`, `blocked`, `decision`,
`explanations`) zaten §7'deki determinism garantisinin kapsamındadır (aynı
seed + aynı girdi + aynı config ⇒ bunlar da dahil olmak üzere bit bit aynı
`RaceTimeline`). Dolayısıyla mevcut replay mekanizması, hiçbir değişiklik
gerektirmeden FAZ5 alanlarını da otomatik olarak doğru şekilde yeniden
üretir; bu madde brief §58'in FAZ5 sonrası da hâlâ karşılandığını teyit
eder.

## 11. Uygulama durumu (FAZ 5, bu oturum)

Bu doküman artık şunları yansıtır: `domain/race/race-engine.ts`,
3 geçişli (jokey kararı + kulvar değişimi → kulvar doluluğu + geçiş çözümü
→ nihai performans puanı) bir segment-içi döngüyle yeniden yazıldı (brief
§21). Yeni saf modüller: `overtaking.ts`, `jockey-decisions.ts`,
`sprint.ts`, `fatigue.ts`, `race-explanation.ts`, `race-interpolation.ts`
(bkz. `docs/ALGORITHMS.md` "Uygulama notu (FAZ 5)" bölümü, formül
detayları için). NestJS Application katmanına (`SimulateRaceUseCase`)
kablolama ve 3D/görsel katmanın yeni `lane`/`blocked` alanlarını
kullanması **kapsam dışıdır** — bu domain katmanı teslimatı sonraki bir
oturumda ele alınacaktır.
