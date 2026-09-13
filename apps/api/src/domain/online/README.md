# domain/online

FAZ 7 — brief §41 ONLINE MİMARİ, §42 ONLINE GÜVENLİK, §43 "Elo benzeri
sistem". Bu klasör, brief'in "Matchmaking / PvP / Race rooms / Anti-cheat /
Server-authoritative simulation" başlıklarını kapsar (ROADMAP.md Faz 7).

- `elo.ts` — `calculateExpectedScore`, `applyEloUpdate` (brief §43 "Elo
  benzeri sistem PvP için ayrıca uygulanabilir").
- `matchmaking.ts` — `calculateRatingRangeAtWait` (bekleme süresine göre
  genişleyen reyting aralığı), `findBestMatch` (kuyruktaki en adil rakibi
  bulur).
- `anti-cheat.ts` — `pickAllowedClientFields` (genel amaçlı allowlist
  filtresi), `assertSnapshotMatchesAuthoritative` (brief §42 "backend kendi
  DB değerini kullanmalıdır" ilkesinin gözlemlenebilir/loglanabilir bir
  ihlal sinyaline dönüştürülmüş hâli).
- `race-room.ts` — `validateRaceRoomParticipants` (brief §41 "participant
  validation"), `createRaceRoomSeed` (brief §41 "seed").
- `errors.ts` — `DuplicateHorseInRaceRoomError`,
  `InvalidRaceRoomParticipantCountError`, `AntiCheatViolationError`,
  `NoOpponentFoundError`.

Config: `online.config.json` (`elo`, `matchmaking` bölümleri).

**Önemli tasarım kararı — YENİ bir simülasyon motoru YAZILMADI:** brief §41
akışındaki "Race Simulation" adımı, zaten var olan ve FAZ 5'te tamamen
doğrulanmış `domain/race/race-engine.ts` `simulateRace`'tir. PvP/online
yarışlar bu motoru bir "oda" (room) bağlamında — birden fazla GERÇEK
oyuncunun snapshot'larıyla, server-authoritative bir seed'le — çağırır.
Bu klasördeki dosyalar sadece o odaya GİRİŞ (validation, snapshot bütünlüğü,
seed üretimi) sorumluluğunu taşır.

**Kapsam dışı:** gerçek WebSocket/oda yönetimi altyapısı (application/
infrastructure katmanı), `RaceEntrantSnapshot`'ın DB'den nasıl authoritative
olarak hesaplanacağı (zaten mevcut `domain/race/base-ability.ts` + ilgili
domain'lerin sorumluluğudur, bu dosya sadece SONUCUNU doğrular).

Testler: `apps/api/test/domain/online/{elo,matchmaking,anti-cheat,race-room}.spec.ts`.

## FAZ 1 wiring, on dördüncü dilim — Gerçek PvP Eşleştirme (bu oturum)

`elo.ts`/`matchmaking.ts`/`race-room.ts` FAZ 7'den beri hazır ama hiç
wiring edilmemiş saf fonksiyonlardı — bu dilim onları `POST`/`DELETE
/matchmaking/queue`'ya bağlar (bkz. `application/use-cases/
{join,leave}-matchmaking-queue.use-case.ts`, docs/API.md §9, docs/ROADMAP.md
"FAZ 1 wiring — On dördüncü dilim"):

- Yeni tablolar (`database/migrations/0018_add_pvp_matchmaking.up.sql`):
  `players.rating` (brief §43 Elo), `matchmaking_tickets` (kuyruk),
  `pvp_matches` (tamamlanmış maç kaydı — gerçek simülasyon, `races`/
  `race_entries` üzerinden, `RaceRepository.savePvpMatch`'tir).
- TASARIM KARARI: eşleştirme TAMAMEN SENKRONDUR — sandbox'ta bir
  zamanlanmış görev/arka plan işçisi altyapısı kurulamadığından (bkz.
  `domain/market`'in on üçüncü dilimindeki AYNI keşif), `join` isteğinin
  KENDİSİ uygun bir rakip bulursa yarışı HEMEN simüle eder ve sonucu aynı
  yanıtla döner.
- `NoOpponentFoundError` BİLİNÇLİ olarak KULLANILMADAN bırakıldı — "rakip
  yok" burada bir HATA değil, normal bir `{matched: false, ticket}`
  yanıtıdır (bkz. o hatanın kendi doc yorumu).
- Yeni hatalar: `AlreadyInMatchmakingQueueError`, `NotInMatchmakingQueueError`
  (`domain/market/errors.ts`'teki `HorseAlreadyListedError`/
  `ListingNotFoundError` ile AYNI kategori).
- KAPSAM DIŞI (bilinçli): giriş ücreti/ödül YOK (Elo-only), oyuncu kendi
  taktiğini seçemez (`DEFAULT_RACE_TACTIC` sabit), kuyruk biletlerinin
  TTL'i/temizliği YOK, gerçek zamanlı/WebSocket maç bildirimi YOK — bkz.
  `JoinMatchmakingQueueUseCase` doc yorumundaki tam liste.

Testler: `apps/api/test/api/matchmaking.e2e-spec.ts`.
