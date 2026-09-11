# application/use-cases

Bu klasör **FAZ 1**'den itibaren doldurulacaktır.

Örnek use-case'ler (brief §49): `BuyHorseUseCase`, `SellHorseUseCase`,
`TrainHorseUseCase`, `FeedHorseUseCase`, `EnterRaceUseCase`,
`StartRaceUseCase`, `SimulateRaceUseCase`, `BreedHorseUseCase`,
`UpgradeStableUseCase`.

Her use-case, `domain/` katmanındaki saf iş kurallarını orkestre eder ve
`infrastructure/` katmanına yalnızca interface (port) üzerinden bağlanır
(bkz. `docs/ARCHITECTURE.md` §4).
