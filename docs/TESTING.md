# TESTING.md — Test Stratejisi

> Kaynak: `docs/PROJECT_BRIEF.md` §53 (Test Stratejisi), §75 (Acceptance
> Criteria — MVP), §83 (Race Balance Test), Kural 8/13. Test çatısı:
> **Vitest** (hem `apps/api` hem `packages/*` için; hafif, TypeScript'e
> yerleşik destek verir, Jest'e göre daha hızlı başlar).

## 1. Genel prensip

> Kritik oyun algoritmaları (Race Engine, Genetics, Economy) unit test ile
> korunmalıdır ve **test edilmeden bir sonraki sisteme geçilmez** (brief
> §91).

Her modül tamamlandığında:

```text
IMPLEMENT → TEST → VERIFY (determinism/denge) → DOCUMENT → sonraki modül
```

Bu sıra `docs/PROJECT_BRIEF.md` §72 CLAUDE CODE GELİŞTİRME PROTOKOLÜ ile
birebir aynıdır ve bu depoda yapılan/yapılacak her katkı için geçerlidir.

## 2. Test katmanları

| Katman | Kapsam | Araç |
|---|---|---|
| Unit | Domain fonksiyonları (Race Engine, genetik, config loader) | Vitest |
| Entegrasyon | Application use-case'leri + gerçek/test PostgreSQL | Vitest + testcontainers (öneri) |
| API (e2e) | REST endpoint'leri uçtan uca | Vitest + Supertest |
| Denge (balance) | Binlerce simülasyon, istatistiksel dağılım | `tools/balance-simulator` (özel script) |
| Frontend bileşen | UI bileşenleri (render, etkileşim) | Vitest + React Testing Library |

## 3. Race Engine testleri (brief §53 — birebir + genişletilmiş)

- Daha yüksek `speed` genel olarak daha hızlı bitirmeli (istatistiksel,
  tek yarışta değil çok sayıda simülasyonda ortalama olarak).
- Daha düşük `stamina` uzun yarışlarda (long distance) dezavantaj
  yaratmalı, kısa yarışlarda etkisi daha az olmalı.
- Grass specialist (`horse_surface_stats.grass` yüksek) çim pistte
  avantaj sağlamalı.
- Dirt specialist dirt pistte avantaj sağlamalı.
- Yüksek `fatigue` performansı ölçülebilir şekilde azaltmalı.
- Sakatlık (`injury_risk` gerçekleşmesi) performansı azaltmalı.
- Jokey farkı sonucu etkilemeli ama tek başına belirleyici olmamalı
  (yani düşük kaliteli at + en iyi jokey, yüksek kaliteli at + vasat
  jokeyi sistematik olarak yenmemeli).
- Randomness sınırlandırılmış olmalı (`RandomFactor` config'deki aralığı
  aşmamalı).
- **Determinism**: aynı `simulationSeed` + aynı `RaceSimulationInput` +
  aynı `RaceBalanceConfig` → bit bit aynı `RaceTimeline`.

Örnek test iskeleti: `apps/api/test/domain/race/race-engine.spec.ts`
(bkz. dosyanın kendisi — bu depoda FAZ 0 kapsamında oluşturulmuştur).

## 4. Genetics testleri (brief §53 — FAZ 3)

- Çocuk özellikleri ebeveyn dağılımından istatistiksel olarak çıkmalı.
- Mutasyon config'deki sınırları aşmamalı.
- `child_potential`, üst sınırı aşmamalı.
- Soy bağlantısı (`pedigrees`) doğru kaydedilmeli.

## 5. Economy testleri (brief §53 — FAZ 1'den itibaren)

- Negatif para oluşmamalı (hem use-case seviyesinde hem DB `CHECK`
  seviyesinde test edilir).
- Aynı işlem (aynı Idempotency-Key) iki kez uygulanmamalı.
- Yarış ödülü sadece server tarafından verilmeli (client'tan gelen ödül
  miktarı hiçbir koşulda kabul edilmemeli).
- Satın alma atomik olmalı (para düşümü + mülkiyet devri tek transaction).

## 6. Denge testi (brief §83)

```text
10.000 yarış simülasyonu (farklı at/jokey/pist/hava kombinasyonlarıyla)
      ↓
dağılım analizi: Win Rate, Top 3 Rate, Average Finish Time, Upset Rate,
                 Surface Effect, Distance Effect, Jockey Effect, Fatigue Effect
      ↓
balance report (JSON/CSV çıktısı, `tools/balance-simulator/reports/`)
```

Bu araç `apps/api`'yi ayağa kaldırmadan doğrudan Race Engine'i çağırır
(bkz. `docs/RACE_ENGINE.md` §2). CI'da periyodik olarak çalıştırılması ve
sonuçların önceki rapor ile karşılaştırılması (regresyon tespiti) önerilir.

## 7. MVP Acceptance Criteria (brief §75 — takip listesi)

Bu liste `docs/ROADMAP.md`'deki FAZ 1 tamamlanma kriteri olarak
kullanılacaktır; brief'teki 21 maddelik checklist birebir korunmuştur
(bkz. `docs/PROJECT_BRIEF.md` §75).

## 8. CI (GitHub Actions) — önerilen pipeline

```text
on: [push, pull_request]
jobs:
  build:
    - checkout
    - setup-node (20.x)
    - npm ci
    - npm run lint
    - npm run typecheck
    - npm run test
    - npm run build
```

Bu depoda `.github/workflows/ci.yml` olarak FAZ 0 kapsamında iskelet
halinde oluşturulmuştur; `npm install` bu ortamda çalıştırılamadığından
CI'ın gerçek bir GitHub Actions runner'ında (npm registry erişimi açık)
ilk kez çalıştırılması gerekir.
