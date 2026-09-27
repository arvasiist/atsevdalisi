# application/use-cases

Her use-case, `domain/` katmanındaki saf iş kurallarını orkestre eder ve
`infrastructure/` katmanına yalnızca interface (port) üzerinden bağlanır
(bkz. `docs/ARCHITECTURE.md` §4).

**DÜZELTME (27.09.2026)** — bu dosya daha önce "Bu klasör FAZ 1'den itibaren
doldurulacaktır" diyordu ve 9 "örnek use-case" adı listeliyordu. O tarihte
klasörde **28 gerçek use-case** vardı, yani açıklama tamamen bayattı; üstelik
listelenen 9 addan **6'sı bu depoda hiç var olmamıştı**. Yanlış olan kısım
özellikle zararlıydı: var olmayan bir sınıfı arayan biri ya boşuna zaman
kaybediyor ya da "acaba silinmiş mi" diye şüpheye düşüyordu. Aşağıdaki liste
dosya sisteminden ÜRETİLMİŞTİR, brief'ten kopyalanmamıştır.

## Gerçekten var olan use-case'ler (28)

**Oyuncu / kimlik:** `RegisterPlayerUseCase`, `LoginWithProviderUseCase`,
`GetPlayerUseCase`

**At / ahır (okuma):** `GetHorseUseCase`, `ListHorsesByOwnerUseCase`,
`GetHorseMarketValueUseCase`, `GetStableSummaryUseCase`

**Antrenman / bakım:** `TrainHorseUseCase`, `GetTrainingHistoryUseCase`,
`PerformCareActionUseCase`, `FeedHorseUseCase`

**Ekipman:** `CreateHorseEquipmentUseCase`, `EquipHorseEquipmentUseCase`,
`UnequipHorseEquipmentUseCase`, `ListHorseEquipmentUseCase`

**Pazar:** `CreateMarketListingUseCase`, `BuyMarketListingUseCase`,
`CancelMarketListingUseCase`, `GetMarketListingUseCase`,
`ListMarketListingsUseCase`, `ListMarketListingsBySellerUseCase`

**Yarış / online:** `RunPracticeRaceUseCase`, `GetRaceTimelineUseCase`,
`GetRecentRaceResultsUseCase`, `JoinMatchmakingQueueUseCase`,
`LeaveMatchmakingQueueUseCase`

**Ekonomi / tesis:** `ClaimDailyRewardUseCase`, `UpgradeStableUseCase`

## Brief adı → gerçek ad (karıştırılması kolay olanlar)

`docs/PROJECT_BRIEF.md` §49 ve eski sürümlerdeki bazı adlar bu depoda
**farklı** adlarla yaşıyor; aynı şeyi aradığınızdan emin olun:

| Brief'teki ad | Bu depodaki gerçek ad |
|---|---|
| `BuyHorseUseCase` | `BuyMarketListingUseCase` (pazar ilanı satın alınır, at doğrudan değil) |
| `SellHorseUseCase` | `CreateMarketListingUseCase` |
| `EnterRaceUseCase` / `StartRaceUseCase` | `RunPracticeRaceUseCase`, `JoinMatchmakingQueueUseCase` |
| `SimulateRaceUseCase` | **Yok** — simülasyon `domain/race/race-engine.ts`'te koşar, ayrı bir use-case'e sarılmamıştır |

## Henüz VAR OLMAYAN use-case'ler

Bunlar brief'te geçer ama bu klasörde karşılıkları yoktur — aramayın,
yazılmaları gerekir:

- **`BreedHorseUseCase`** — yetiştiricilik. Domain mantığı (`domain/breeding/`)
  tamamen yazılmış ve test edilmiştir, ama **hiçbir HTTP uç noktası, repository
  veya use-case yoktur**; `breeding_pairs`/`pedigrees` tablolarına bu depodaki
  hiçbir kod YAZMAZ (bkz. `PROJE_DURUMU.md` §13).
- **Turnuva / kulüp / sezon / ilerleme (progression) / sıralama** use-case'leri —
  domain mantıkları var, application katmanı yok.
- **`SimulateRaceUseCase`** — yukarıdaki tabloya bkz.
