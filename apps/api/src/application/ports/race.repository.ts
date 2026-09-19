import type { PvpMatch, Race, RaceEntry, RaceSegmentSnapshot, RecentRaceResultView } from '@at-sevdalisi/shared-types';

/**
 * `RaceRepository` — Application katmanının Infrastructure'a bağlandığı
 * PORT (interface), diğer repository port'larıyla AYNI desen
 * (docs/ARCHITECTURE.md §4).
 */
export interface RaceRepository {
  /**
   * FAZ 1 wiring, sekizinci dilim — Pratik Yarış (brief §6). `races` +
   * `race_entries` + `race_entry_segments` (migration 0006/0014) satırlarını
   * TEK bir transaction'da yazar (`withTransaction`, ama `SELECT ... FOR
   * UPDATE` YOK — bkz. `RunPracticeRaceUseCase` üstündeki not: bu, VAR
   * OLAN paylaşılan bir satırı güncellemek değil, TAMAMEN YENİ satırlar
   * eklemek, bu yüzden docs/SECURITY.md §5'in çözdüğü çift-harcama riski
   * burada YOK — transaction yalnızca "ya hepsi ya hiçbiri" garantisi
   * için kullanılıyor).
   *
   * Bot rakipler (`generateBotEntrants`) burada YAZILMAZ — `race_entries.
   * horse_id` gerçek bir `horses` satırına FOREIGN KEY'dir, botlar için
   * sahte bir at/oyuncu kaydı oluşturmak yerine bu kapsam dışı bırakıldı
   * (bkz. use-case doc yorumu).
   */
  savePracticeRace(race: Race, entry: RaceEntry, segments: RaceSegmentSnapshot[]): Promise<void>;

  /**
   * AUDIT_REPORT.md Bulgu E1 (High, bu oturum) — `RunPracticeRaceUseCase`
   * ÖNCEDEN cüzdan mutasyonunu (`PlayerRepository.updateWithLock`) ve yarış
   * kaydını (`savePracticeRace`, yukarıdaki metot) İKİ AYRI transaction'da
   * yapıyordu: para transaction'ı commit olduktan SONRA yarış kaydı
   * BAŞARISIZ olursa (ör. bağlantı kopması), oyuncunun parası zaten
   * hareket etmiş ama hiçbir yarış kaydı YOKTUR — ve `IdempotencyInterceptor`
   * hata durumunda `pending` satırını SİLDİĞİNDEN, aynı Idempotency-Key
   * ile bir SONRAKİ deneme işlemi BAŞTAN çalıştırır (ÇİFT giriş ücreti
   * tahsilatı/ÇİFT ödül verme riski).
   *
   * Bu metot, `PostgresMarketPurchaseRepository.executePurchase` ile AYNI
   * ilkeyle (bkz. o dosyanın doc yorumu — "kendi transaction'ını yönetir"),
   * oyuncunun `players` satırını KİLİTLEMEYİ, `applyPracticeRaceStakes`
   * (saf domain fonksiyonu) ile bakiyeyi hesaplamayı, güncellenmiş satırı +
   * ledger girişlerini YAZMAYI, VE `races`/`race_entries`/
   * `race_entry_segments` satırlarını eklemeyi TEK bir Postgres
   * transaction'ında birleştirir — "ya hepsi ya hiçbiri" artık GERÇEKTEN
   * garantidir (bkz. `postgres-race.repository.spec.ts`'teki gerçek
   * Postgres'e karşı rollback testi: yarış kaydı taraf BAŞARISIZ olursa
   * bakiye de GERİ ALINIR).
   *
   * Eski `savePracticeRace` metodu KALDIRILMADI (`insertRaceRow`/
   * `insertEntryWithSegments` yardımcılarını PAYLAŞIR, `savePvpMatch`
   * hâlâ onu kullanır) — yalnızca `RunPracticeRaceUseCase` artık BUNU
   * çağırır.
   */
  savePracticeRaceWithStakes(input: SavePracticeRaceWithStakesInput): Promise<SavePracticeRaceWithStakesResult>;

  /**
   * FAZ 1 wiring, on dördüncü dilim (bu oturum) — PvP Eşleştirme (brief
   * §41). `savePracticeRace` ile AYNI "ya hepsi ya hiçbiri" transaction
   * gerekçesi (satır kilitleme YOK, TAMAMEN yeni satırlar eklenir) — TEK
   * farkı, İKİ gerçek katılımcı olduğu için `race_entries`/segment
   * satırlarının İKİ SETİ ve ayrıca bir `pvp_matches` satırı yazılır
   * (bkz. `database/migrations/0018_add_pvp_matchmaking.up.sql`).
   * Botların AKSİNE (`savePracticeRace` doc yorumu), BURADA iki taraf da
   * gerçek `horses`/`players` satırlarına sahiptir — bu yüzden HER iki
   * katılımcı için de `race_entries` VE `race_entry_segments` yazılır
   * (pratik yarıştaki "yalnızca oyuncunun atı" kısıtlaması burada YOK).
   */
  savePvpMatch(
    race: Race,
    entries: [RaceEntry, RaceEntry],
    segments: RaceSegmentSnapshot[],
    match: PvpMatch,
  ): Promise<void>;

  /**
   * Faz 2 (görsel kalite planı) — Ana Sayfa "Son Yarış Sonuçları" paneli
   * (brief §38'e komşu, `StableSummaryView` ile AYNI "Ana Sayfa kartı"
   * kategorisi). `races`/`race_entries`/`horses` (owner_id ile) JOIN
   * edilerek OYUNCUNUN KENDİ atlarının sonuçlanmış pratik yarışları en
   * yeniden eskiye doğru okunur — bkz. `RecentRaceResultView` doc yorumu
   * (bot rakipler dahil DEĞİLDİR, salt okunur bir sorgudur).
   */
  findRecentResultsByOwnerId(ownerId: string, limit: number): Promise<RecentRaceResultView[]>;
}

/** `RaceRepository.savePracticeRaceWithStakes` (AUDIT_REPORT.md E1) girdi şekli. */
export interface SavePracticeRaceWithStakesInput {
  race: Race;
  entry: RaceEntry;
  segments: RaceSegmentSnapshot[];
  /** Kilitlenecek/güncellenecek `players` satırı — `horse.ownerId` (bkz. `RunPracticeRaceUseCase`). */
  playerId: string;
  /** `getPracticeRaceEntryFee`'den — 0 ise düşüm/ledger girişi hiç yazılmaz. */
  entryFee: number;
  /** `getPracticeRacePrize`'dan — 0 ise ekleme/ledger girişi hiç yazılmaz. */
  prizeWon: number;
}

/** `RaceRepository.savePracticeRaceWithStakes` sonucu — `WalletBalance` ile AYNI şekil (`domain/economy/wallet.ts`). */
export interface SavePracticeRaceWithStakesResult {
  money: number;
  gems: number;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const RACE_REPOSITORY = Symbol('RACE_REPOSITORY');
