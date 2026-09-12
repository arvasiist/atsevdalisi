# domain/tournament

FAZ 7 — brief §35 YARIŞ TAKVİMİ "Özel kupalar / Büyük ödüllü yarışlar" ve
§68 "Görevler ve Retention: Tournament".

- `tournament.ts` — `checkTournamentEligibility` (brief §35
  `EntryRequirement`/`EntryFee`), `seedTournamentBracket` (reytinge göre
  deterministik kura), `distributeTournamentPrizes` (brief §35 `PrizePool`
  dağıtımı).
- `errors.ts` — `TournamentNotOpenForRegistrationError`,
  `TournamentFullError`, `PlayerLevelTooLowError`,
  `InsufficientFundsForEntryFeeError`.

Config: `online.config.json` (`tournament` bölümü: `tiers`,
`prizeDistributionByPlacement`).

**Kapsam dışı:** gerçek eşleşme/bracket İLERLETME akışı (turdan tura kimin
kiminle eşleşeceği — bu, `domain/online/matchmaking.ts`'in reyting bazlı
eşleştirmesiyle birleştirilerek application katmanında kurulacaktır), para
transferinin GERÇEKLEŞTİRİLMESİ (`distributeTournamentPrizes` sadece
MİKTARLARI hesaplar, `domain/economy/wallet.ts` `transfer` çağrıları
application katmanının sorumluluğundadır).

Testler: `apps/api/test/domain/tournament/tournament.spec.ts`.
