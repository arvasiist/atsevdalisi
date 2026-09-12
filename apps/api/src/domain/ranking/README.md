# domain/ranking

FAZ 7 — brief §43 SIRALAMA: "Global, Türkiye, Arkadaşlar, Kulüp, Sezon,
Haftalık, Aylık" sıralama tabloları ve `RankingScore` formülü.

- `ranking-score.ts` — `calculateRankingScore` (brief §43: RankingScore =
  RacePerformance + WinBonus + PlacementBonus + TournamentBonus).
- `leaderboard.ts` — `buildLeaderboard` (standart yarışma sıralaması —
  eşit puanlılar aynı rank'i paylaşır), `filterLeaderboardByScope`,
  `findPlayerRank`.

Config: `online.config.json` (`ranking` bölümü).

**Kapsam dışı:** DB'den hangi kayıtların (`scope`/`scopeKey`'e göre) hangi
zaman aralığında çekileceği (örn. "haftalık" sıralamanın haftanın hangi
günü resetleneceği) application/infrastructure katmanının sorumluluğundadır
— bu dosyalar sadece ELDEKİ bir girdi listesini sıralar/puanlar.

Testler: `apps/api/test/domain/ranking/{ranking-score,leaderboard}.spec.ts`.
