import type {
  PvpMatch,
  Race,
  RaceEntry,
  RaceSegmentSnapshot,
  RaceTimelineView,
  RecentRaceResultView,
} from '@at-sevdalisi/shared-types';
import type { OnlineConfig } from '@at-sevdalisi/game-config';

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
   * Bot rakipler (`generateBotEntrants`) burada YAZILMAZ — bu metot
   * `RunPracticeRaceUseCase` tarafından ARTIK HİÇ ÇAĞRILMIYOR (bkz. dosya
   * sonundaki "Eski `savePracticeRace` metodu KALDIRILMADI" notu), bu
   * yüzden AUDIT_REPORT.md Bulgu R2 (bu oturum) düzeltmesi BURAYA
   * uygulanmadı — R2'nin çözümü (`RaceEntry.botLabel`, `horse_id` artık
   * nullable) yalnızca aşağıdaki `savePracticeRaceWithStakes`'te geçerlidir.
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
   *
   * AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — `input.entry`/
   * `input.segments` (TEKİL, yalnızca oyuncunun atı) `input.entries`
   * (DİZİ — oyuncunun atı + `savePvpMatch`'teki AYNI desenle TÜM bot
   * rakipler) + `input.segments` (TÜM katılımcıların BİRLEŞTİRİLMİŞ
   * segmentleri, her biri KENDİ `entry.id`'sine göre filtrelenir) olarak
   * DEĞİŞTİ — tam alan (full-field) replay'in DB'den doğrudan okunabilmesi
   * için botların da artık `race_entries`/`race_entry_segments`'e
   * yazılması GEREKİYORDU (bkz. `RaceEntry.botLabel` doc yorumu,
   * `database/migrations/0025_add_race_entry_bot_support.up.sql`).
   * Dizideki İLK eleman HER ZAMAN oyuncunun kendi girişidir (`RunPracticeRaceUseCase`
   * bu sırayı garanti eder) — repository'nin kendisi bu SIRAYA bağımlı
   * DEĞİLDİR, yalnızca `RunPracticeRaceUseCase`'in dönüş değerini oluştururken
   * kullanışlıdır.
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
   *
   * AUDIT_REPORT.md Bulgu E1'in PvP analogu (bu oturum, proje sahibinin
   * "hangi adımı istiyorsan yapabilirsin" yetkilendirmesiyle) — bu metot
   * ARTIK `JoinMatchmakingQueueUseCase` tarafından ÇAĞRILMIYOR (bkz.
   * dosya sonundaki "Eski `savePracticeRace` metodu KALDIRILMADI" notuyla
   * AYNI kategori: `insertRaceRow`/`insertEntryWithSegments` yardımcılarını
   * hâlâ PAYLAŞTIĞINDAN silinmedi, ama kullanıcı yolunda DEĞİL). Sorun:
   * `JoinMatchmakingQueueUseCase` Elo reyting güncellemesini
   * (`PlayerRepository.updateTwoWithLock`) ile yarış/PvP kaydını (BU
   * metot) İKİ AYRI transaction'da yapıyordu — E1 ile YAPISAL OLARAK AYNI
   * risk (ikinci transaction başarısız olursa reyting değişmiş ama maç
   * kaydı YOK kalır), ama `entryFee`/`prizePool` her zaman 0 olduğundan
   * mali risk TAŞIMIYORDU (bu yüzden E1'in kendisi bu turun kapsamı
   * dışında bırakılmıştı). Çözümü aşağıdaki `savePvpMatchWithRatings`'te.
   */
  savePvpMatch(
    race: Race,
    entries: [RaceEntry, RaceEntry],
    segments: RaceSegmentSnapshot[],
    match: PvpMatch,
  ): Promise<void>;

  /**
   * AUDIT_REPORT.md Bulgu E1'in PvP analogu (bu oturum) — bkz. yukarıdaki
   * `savePvpMatch` doc yorumundaki tam gerekçe. `savePracticeRaceWithStakes`
   * ile AYNI desen: bu metot `PlayerRepository`'yi HİÇ KULLANMAZ, kendi
   * transaction'ını yönetir — HER İKİ oyuncunun `players` satırını
   * `PlayerRepository.updateTwoWithLock` ile AYNI deadlock-önleme
   * mantığıyla (id'lerin SÖZLÜKSEL sırasına göre) KİLİTLER, `applyEloUpdate`
   * (saf domain fonksiyonu) ile yeni reytingleri hesaplar, HER İKİ satırı
   * günceller, SONRA (satırlar hâlâ AYNI transaction/client içindeyken)
   * `races`/`race_entries`/`race_entry_segments`/`pvp_matches` satırlarını
   * ekler. Herhangi bir adım başarısız olursa `withTransaction` TÜMÜNÜ
   * (reytingler dahil) ROLLBACK eder — artık Elo'nun maç kaydından
   * BAĞIMSIZ bir duruma düşmesi mümkün DEĞİL.
   */
  savePvpMatchWithRatings(input: SavePvpMatchWithRatingsInput): Promise<SavePvpMatchWithRatingsResult>;

  /**
   * Faz 2 (görsel kalite planı) — Ana Sayfa "Son Yarış Sonuçları" paneli
   * (brief §38'e komşu, `StableSummaryView` ile AYNI "Ana Sayfa kartı"
   * kategorisi). `races`/`race_entries`/`horses` (owner_id ile) JOIN
   * edilerek OYUNCUNUN KENDİ atlarının sonuçlanmış pratik yarışları en
   * yeniden eskiye doğru okunur — bkz. `RecentRaceResultView` doc yorumu
   * (bot rakipler dahil DEĞİLDİR, salt okunur bir sorgudur).
   */
  findRecentResultsByOwnerId(ownerId: string, limit: number): Promise<RecentRaceResultView[]>;

  /**
   * AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — `GET /races/:id/timeline`.
   * `races` + TÜM `race_entries` (gerçek at VE bot satırları) + TÜM
   * `race_entry_segments`'i tek bir görünüme birleştirip döner; `race`
   * satırı yoksa `null` döner (use-case bunu `RaceNotFoundError`'a çevirir —
   * bu port'un kendisi HTTP/domain hatası BİLMEZ, docs/ARCHITECTURE.md §4).
   * Salt okunur, `withTransaction` GEREKMEZ (`findRecentResultsByOwnerId`
   * ile AYNI gerekçe).
   */
  findTimelineByRaceId(raceId: string): Promise<RaceTimelineView | null>;

  /**
   * AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — `GET /races/:id/timeline`
   * yetkilendirmesi: bu yarışta `playerId`'ye ait EN AZ bir gerçek at
   * (bot DEĞİL) katılımcı olarak var mı? `HorseOwnerGuardByParam` ile AYNI
   * "sahiplik" ilkesi ama farklı şekil — burada tekil bir at DEĞİL, bir
   * YARIŞTA katılım sorgulanıyor, bu yüzden ayrı bir route guard yerine
   * use-case seviyesinde bir port metodu olarak modellendi (`assertSelf`
   * ile KARŞILAŞTIRILAMAZ: `playerId` her zaman `CurrentPlayer()`'dan gelir,
   * URL'den gelen bir "iddia edilen kimlik" değil).
   */
  isPlayerParticipant(raceId: string, playerId: string): Promise<boolean>;
}

/** `RaceRepository.savePracticeRaceWithStakes` (AUDIT_REPORT.md E1) girdi şekli. */
export interface SavePracticeRaceWithStakesInput {
  race: Race;
  /**
   * AUDIT_REPORT.md Bulgu R2 (bu oturum) — bkz. `savePracticeRaceWithStakes`
   * doc yorumundaki tam gerekçe. İLK eleman oyuncunun kendi girişidir.
   */
  entries: RaceEntry[];
  /** TÜM `entries`'in BİRLEŞTİRİLMİŞ segmentleri — her segment kendi `raceEntryId`'sine göre ilgili girişle eşleştirilir. */
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

/**
 * `RaceRepository.savePvpMatchWithRatings` (AUDIT_REPORT.md E1'in PvP
 * analogu) girdi şekli. "A"/"B" adlandırması `PlayerRepository.
 * updateTwoWithLock`'un `buyer`/`seller` adlandırmasıyla AYNI ruhta —
 * parasal/hiyerarşik bir anlamları YOK, yalnızca `match.playerIds`
 * dizisindeki sıraya karşılık gelirler (`match.playerIds[0]` = A,
 * `match.playerIds[1]` = B). `JoinMatchmakingQueueUseCase` bu diziyi
 * HER ZAMAN `[çağıranın playerId'si, rakibin playerId'si]` sırasıyla
 * doldurur (bkz. o use-case'teki `match` nesnesi).
 */
export interface SavePvpMatchWithRatingsInput {
  race: Race;
  /** Sıra ÖNEMLİ DEĞİL burada (ikisi de gerçek at/oyuncu) — `insertEntryWithSegments` her ikisi için de aynı şekilde çağrılır. */
  entries: [RaceEntry, RaceEntry];
  /** İki katılımcının BİRLEŞTİRİLMİŞ segmentleri — her segment kendi `raceEntryId`'sine göre ilgili girişle eşleştirilir. */
  segments: RaceSegmentSnapshot[];
  match: PvpMatch;
  /** `match.playerIds[0]` (A) için gerçek maç skoru — 1 = A kazandı, 0 = A kaybetti, 0.5 = berabere. `applyEloUpdate`'e AYNEN geçirilir. */
  scoreA: 0 | 0.5 | 1;
  /** `AppConfigService.online` — `applyEloUpdate`'in k-faktörü/taban reyting parametreleri için. */
  onlineConfig: OnlineConfig;
}

/** `RaceRepository.savePvpMatchWithRatings` sonucu — "A"/"B" `SavePvpMatchWithRatingsInput` doc yorumundaki AYNI anlam. */
export interface SavePvpMatchWithRatingsResult {
  ratingABefore: number;
  ratingAAfter: number;
  ratingBBefore: number;
  ratingBAfter: number;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const RACE_REPOSITORY = Symbol('RACE_REPOSITORY');
