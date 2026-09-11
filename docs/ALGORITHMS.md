# ALGORITHMS.md — Formüller ve Hesaplama Kuralları

> Kaynak: `docs/PROJECT_BRIEF.md` §10 (Antrenman), §17-18 (Yarış performansı,
> controlled randomness), §20-21 (Pace, Overtaking), §26-27 (Gelişim, Yaş),
> §28 (Genetik), §30 (Pazar değeri), §61-63 (Hava/pist/mesafe). Tüm sabitler
> `config/*.config.json` dosyalarından okunur — **hiçbir ağırlık kodda
> gömülü olmamalıdır** (brief §52, Kural 6/7).

## 1. Antrenman kazancı (brief §10)

```text
training_gain =
    base_gain
    × intensity_multiplier
    × potential_factor
    × trainer_factor
    × health_factor
    × recovery_factor
```

Diminishing returns (aynı stat'ı sürekli çalıştırmanın azalan getirisi):

```text
effective_gain = base_gain × (1 - current_stat / max_stat) ^ diminishing_exponent
```

`diminishing_exponent` config'de `0.7` olarak tanımlıdır
(`config/training.config.json`). Potansiyel sınırına yaklaşıldıkça
(`current_stat → potential`) gelişim yavaşlar; `current_stat` hiçbir zaman
`potential`'ı aşamaz.

Yorgunluk kazancı:

```text
fatigue_gain =
    base_fatigue
    × intensity_multiplier
    × duration_multiplier
    × current_fatigue_modifier
```

Sakatlık riski:

```text
injury_risk =
    base_risk
    × intensity_multiplier
    × fatigue_modifier
    × health_modifier
    × age_modifier
```

Tüm çarpanlar `config/training.config.json` içinde, yoğunluk (`low/medium/
high`) ve antrenman türü (`speed/sprint/stamina/start/cornering/tempo`)
bazında tanımlıdır.

## 2. Yarış performans formülü (brief §17)

Başlangıç modeli (segment bazlı sisteme geçmeden önceki temel model):

```text
BaseAbility =
    Speed × w_speed
    + Stamina × w_stamina
    + Acceleration × w_acceleration
    + Fitness × w_fitness
    + Tactic × w_tactic
    + Jockey × w_jockey
    + TrackCompatibility × w_track
    + Morale × w_morale
    + Form × w_form
```

Varsayılan ağırlıklar (`config/race.config.json` → `baseAbilityWeights`):

```json
{
  "speed": 0.25, "stamina": 0.20, "acceleration": 0.15, "fitness": 0.10,
  "tactic": 0.10, "jockey": 0.08, "trackCompatibility": 0.05,
  "morale": 0.04, "form": 0.03
}
```

Genel model:

```text
RacePerformance =
    BaseAbility
    × ConditionModifier
    × EnvironmentModifier
    × StrategyModifier
    × JockeyModifier
    × PaceModifier
    + RandomFactor
    - FatiguePenalty
    - InjuryPenalty
```

Bu formül **sabit kabul edilmez**; `RaceBalanceConfig` (`config/race.config.json`)
üzerinden ayarlanabilir olmalıdır (brief §17, §82).

## 3. Controlled randomness (brief §18)

Hedef dağılım:

```text
%70-85 → gerçek performans (BaseAbility × modifiers)
%10-20 → form/koşullar (ConditionModifier, EnvironmentModifier)
%5-10  → kontrollü belirsizlik (RandomFactor)
```

`RandomFactor`, `deriveRandom(seed, raceId, horseId, segmentIndex)`
fonksiyonundan üretilir (bkz. `docs/RACE_ENGINE.md` §7) ve normal dağılıma
yakın, sınırlı bir aralığa (`config/race.config.json` →
`randomFactorRange`, örn. `[-6, 6]`) clamp edilir. Böylece:

- Güçlü bir at %5-10'luk pay yüzünden bazen kaybedebilir (sürpriz mümkün).
- Zayıf bir at sürekli sürpriz yapamaz (pay sınırlı).

## 4. Segment bazlı hesaplama (brief §19)

Yarış, `config/race.config.json` → `segmentLengthMeters` (varsayılan 200m)
değerine göre segmentlere bölünür. Her segmentte güncellenen durum:

```typescript
interface SegmentState {
  currentSpeed: number;
  positionMeters: number;
  stamina: number;
  fatigue: number;
  pace: 'front' | 'chase' | 'even' | 'hold';
  lane: number;
  tacticalState: string;
}
```

Segment geçişinde uygulanan aşama ağırlıkları, o segmentin yarış
uzunluğuna oranına göre `docs/RACE_ENGINE.md` §4'teki 7 aşamadan hangisine
denk geldiğine göre seçilir (örn. ilk segment → "Start" ağırlıkları, orta
segmentler → "Orta bölüm", son 1-2 segment → "Son bölüm" + "Final sprint").

## 5. Pace sistemi (brief §20)

```text
if position == 'front':
    stamina_consumption *= config.pace.frontRunnerStaminaMultiplier   # > 1
    position_bonus = config.pace.frontRunnerPositionBonus
else if position == 'back':
    stamina_consumption *= config.pace.closerStaminaMultiplier        # < 1
    late_stage_bonus = config.pace.closerLateStageBonus
    traffic_risk = config.pace.closerTrafficRisk
```

Bu sayede "önde git" taktiği erken avantaj + yüksek stamina maliyeti,
"geriden gel" taktiği stamina tasarrufu + trafik riski taşır — brief'in
"sadece en yüksek rating kazanır" karşıtı felsefesini (§20 sonu, §89 İlke 1)
doğrudan uygular.

## 6. Overtaking / bloklanma (brief §21)

```text
overtake_probability =
    acceleration
    + speed_difference
    + courage
    + jockey_skill
    + available_space
    - traffic_penalty

if front_horse_blocks_lane:
    overtake_probability -= config.overtaking.blockPenalty
```

İleri sürümde (FAZ 5) iç/dış kulvar, önündeki at, boşluk, viraj ve pist
genişliği ayrı ayrı modellenecektir (brief §21 sonu).

## 7. Çevre uyumu (brief §61)

```text
environment_modifier =
    surface_modifier         # horse_surface_stats × race.surface
    × weather_modifier        # weather.config.json içindeki hava etkisi
    × temperature_modifier
    × distance_modifier       # horse_distance_stats × race.distance kategorisi
```

Zemin/hava kombinasyonları (`config/weather.config.json`):
`sunny+grass(dry)`, `rainy+grass(wet)`, `rainy+dirt(heavy)`, `dirt(dry)`,
`windy`, `cold`, `hot`. Her kombinasyon, ilgili `horse_surface_stats` /
`horse_distance_stats` alanına bir çarpan uygular.

## 8. Mesafe kategorileri (brief §62)

```text
Short  : distance <= config.distance.shortMaxMeters   (örn. 1200m)
Middle : shortMax < distance <= middleMaxMeters        (örn. 1200-1800m)
Long   : distance > middleMaxMeters                    (1800m+)
```

Kısa mesafede `acceleration`, `start_speed`, `sprint` ağırlığı artar; uzun
mesafede `stamina`, `endurance` ağırlığı artar. Ağırlık kaydırma oranları
`config/race.config.json` → `distanceWeightAdjustments` içindedir.

## 9. Yaş ve gelişim eğrisi (brief §27)

```text
growth_factor = age_curve(age)
```

`age_curve`, at yaşam evrelerine (Yavru/Gelişim/Prime/Olgunluk/Yaşlanma)
karşılık gelen bir piecewise fonksiyondur; sınır yaşlar ve her evredeki
çarpanlar `config/horse-growth.config.json` içinde tanımlanır. Prime
döneminde performans potansiyele en yakın seviyeye ulaşır; yaşlanma
evresinde `recovery_rate` düşer, `injury_risk` artar, bazı fiziksel
statlar hafifçe geriler — ancak `tactical_skill`/deneyim gibi jokey
tarafı özellikler farklı (düşmeyen veya artan) bir eğri izleyebilir.

## 10. Genetik kalıtım (brief §28)

Her kalıtsal stat için:

```text
child_stat =
    parent_A_stat × inheritance_A
    + parent_B_stat × inheritance_B
    + mutation

inheritance_A = random(0.35, 0.65)   # server tarafında, seed'e bağlı üretilir
inheritance_B = 1 - inheritance_A
mutation       = clamp(random(-mutationRange, +mutationRange), config.genetics.mutationBounds)
```

`potential` alanı, ebeveynlerin potansiyellerinin ağırlıklı ortalamasına
bir üst sınır (`config.genetics.maxPotentialGainOverParents`) ile
sınırlandırılır — brief §29 "genetik tamamen deterministik değildir" ve
§89 İlke 7 ile tutarlı.

## 11. Pazar değeri (brief §30)

```text
MarketValue =
    Quality × w_quality
    × Potential × w_potential
    × AgeFactor
    × RaceHistoryFactor
    × PedigreeValueFactor
    × HealthFactor
    × DemandFactor
```

Bu, **taban model**dir; gerçek satış fiyatı arz/talep, sezon içi aktivite
ve oyuncu pazarlığı (açık artırmalarda) ile dinamik olarak değişebilir
(brief §30 son cümle). Ağırlıklar `config/economy.config.json` →
`marketValueWeights` içindedir.

## 12. Jokey-at uyumu (brief §13)

```text
compatibility =
    horse_temperament_component
    + jockey_style_component
    + experience_component
    + previous_pair_history_component
```

`previous_pair_history_component`, aynı at-jokey ikilisinin geçmiş
yarışlarındaki ortalama `performance_score`'undan türetilir (bkz.
`race_entries` tablosu) — böylece zamanla "iyi anlaşan" ikililer oyuncuya
görünür bir avantaj sağlar.

## 13. Tüm formüllerin ortak kuralı

Yukarıdaki formüllerin hiçbirinde sabit sayı kodda yazılmaz (brief Kural 6).
Her ağırlık/çarpan/eşik `config/*.config.json` dosyalarından, tip güvenli
`packages/game-config` loader'ı üzerinden okunur (bkz. `docs/CODING_
CONVENTIONS.md` §3). Bu, brief §82 "Balance Tool" hedefiyle birebir
örtüşür: değerler değiştiğinde kod yeniden derlenmeden denge ayarlanabilir.
