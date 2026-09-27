import type {
  PvpMatch,
  Race,
  RaceEntry,
  RaceLobbyView,
  RaceSegmentSnapshot,
  RaceTimelineView,
  RacingStyle,
  RecentRaceResultView,
  RiskLevel,
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
   * AUDIT_REPORT.md Bulgu R3 (Low, bu oturum) — `entrant-snapshot.ts`'in
   * `deriveFormFromRecentResults`'ı (bkz. o fonksiyonun doc yorumu) için:
   * `findRecentResultsByOwnerId` ile AYNI JOIN/şekil, ama OYUNCU değil TEK
   * bir AT bazında filtrelenir (`WHERE re.horse_id = $1`) — bir oyuncunun
   * BİRDEN FAZLA atı olabileceğinden, "formu" hesaplanan atın KENDİ
   * geçmişi, sahibinin TÜM atlarının karışık geçmişinden AYRI tutulmalı.
   * Salt okunur, `withTransaction` GEREKMEZ (`findRecentResultsByOwnerId`
   * ile AYNI gerekçe). Sonuçlar en yeniden eskiye sıralı döner (`limit`
   * uygulanan tarafta değil SQL'de) — çağıran `deriveFormFromRecentResults`
   * bu sıralamaya GÜVENİR, kendi başına yeniden sıralamaz.
   */
  findRecentResultsByHorseId(horseId: string, limit: number): Promise<RecentRaceResultView[]>;

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

  /**
   * Oyuncunun oluşturduğu ücretli yarışı (brief §1-§7, §42 PHASE 1)
   * `races` tablosuna yazar ve lobi görünümünü döner.
   *
   * **PARA HAREKETİ ÜRETMEZ** — giriş ücreti yarışa KATILIRKEN alınır
   * (PHASE 1b), yarış açılırken değil. Bu yüzden `savePracticeRaceWithStakes`
   * gibi bir ledger yazımı veya bakiye kilidi YOKTUR; tek kilit
   * `maxOpenRacesPerPlayer` tavanının atomik olması içindir (bkz.
   * `CreateLobbyRaceResult` doc yorumu).
   *
   * `races` satırı TEK bir `INSERT`tir, ama yine de bir transaction
   * içindedir: tavan kontrolü ile yazma AYNI transaction'da olmak
   * zorundadır, aksi hâlde eşzamanlı iki istek tavanı aşabilir.
   */
  createLobbyRace(input: CreateLobbyRaceInput): Promise<CreateLobbyRaceResult>;

  /**
   * Oyuncuyu bir lobi yarışına KATAR (brief §2/§3/§6, §42 PHASE 1b).
   *
   * **TEK ATOMİK İŞLEM — ve bu BİLİNÇLİDİR.** Katılımın tüm durum
   * kontrolleri (yarış katılabilir mi, kontenjan doldu mu, at oyuncunun mu,
   * at sağlıklı mı, zaten katılmış mı) yarış satırı `FOR UPDATE` ile
   * KİLİTLİYKEN AYNI transaction'da yapılır. Kontroller use-case'e
   * taşınsaydı, kontrol ile yazma arasında geçen sürede yarış dolabilir ya
   * da başlayabilirdi (TOCTOU) — ve burada söz konusu olan PARA.
   *
   * Kilit sırası HER ZAMAN önce `races`, sonra `players`'dır. Aynı yarışa
   * eşzamanlı katılımlar yarış satırında sıraya girer; bu, kilit
   * çevrimdışılığı (deadlock) riskini de ortadan kaldırır.
   *
   * Ücret yalnızca `races.entry_fee > 0` iken alınır; 0 ise `players`
   * satırına HİÇ dokunulmaz (`economy_transactions.amount <> 0` kısıtı
   * sıfır tutarlı bir defter satırını zaten reddederdi).
   *
   * Hata FIRLATIR (`CreateLobbyRaceResult`'ın aksine): buradaki her ret
   * nedeni, çağıranın doğrudan bir domain hatasına çevirdiği bir durumdur
   * ve `savePracticeRaceWithStakes` de aynı deseni kullanır
   * (`PlayerNotFoundError`, `InsufficientFundsError`).
   */
  joinLobbyRace(input: JoinLobbyRaceInput): Promise<RaceLobbyView>;
}

/**
 * `RaceRepository.joinLobbyRace` (brief §2/§3/§6, §42 PHASE 1b) girdi şekli.
 *
 * `playerId` **`CurrentPlayer()`'dan gelir, gövdeden ASLA** (CLAUDE.md kural
 * 1). `idempotencyKey` başlıktan geçirilir ve defter satırına yazılır:
 * aynı anahtarla tekrarlanan istek yeni bir düşüm yaratmaz (interceptor
 * yanıtı önbellekten döner, ama defter satırındaki anahtar denetim
 * izini kalıcı kılar).
 */
export interface JoinLobbyRaceInput {
  raceId: string;
  /** Katılan oyuncu — `CurrentPlayer()`. */
  playerId: string;
  /** Katılınacak at; oyuncunun KENDİ atı olmalı (`HorseNotOwnedError`). */
  horseId: string;
  /** `race_entries.id` — çağıran üretir (`createLobbyRace`'deki `id` deseniyle AYNI). */
  entryId: string;
  tacticalStyle: RacingStyle;
  riskLevel: RiskLevel;
  /** Şu an — `checkRaceJoinable`'a geçirilir; test edilebilirlik için parametredir. */
  now: Date;
  idempotencyKey: string | null;
}

/**
 * `RaceRepository.createLobbyRace` (brief §1-§7, §42 PHASE 1) girdi şekli.
 *
 * **`id` ÇAĞIRAN TARAFINDAN ÜRETİLİR** — `run-practice-race` use-case'inin
 * `randomUUID()` ile `raceId` üretmesiyle AYNI desen (bkz. o dosya).
 * Repository'nin kendisi kimlik üretmez: id tek bir yerde doğar.
 *
 * **`simulationSeed` İSE BURADA `null`'dır** — bu, pratik yarıştan
 * BİLİNÇLİ bir sapmadır; gerekçesi `CreateLobbyRaceInput.simulationSeed`
 * üstündeki doc yorumunda tam olarak açıklanmıştır (özet: erken üretilen
 * bir seed'i yarışı açan kişi okuyup sonucu önceden hesaplayabilir, bu da
 * ücretli bir yarışta doğrudan para kazanma yoludur).
 *
 * `engineVersion`/`rulesetVersion`/`configVersion`/`weatherConfigVersion`
 * BURADA ZORUNLUDUR çünkü `races`'in bu dört sütunu `NOT NULL`dır ve
 * migration 0021/0024 bilerek `DEFAULT`'u KALDIRMIŞTIR ("yeni satırlar HER
 * ZAMAN uygulama kodundan gelen GERÇEK bir değerle yazılsın"). Henüz
 * KOŞMAMIŞ bir yarış için bunlar "bu yarışın koşacağı BEKLENEN sürüm"dür;
 * yarış gerçekten simüle edildiğinde (PHASE 3) kullanılan GERÇEK
 * sürümlerle ÜZERİNE YAZILIR — bu yüzden arada bir engine sürümü artışı
 * olsa bile replay/audit kaydı sonunda doğru kalır.
 */
export interface CreateLobbyRaceInput {
  id: string;
  /** Yarışı açan oyuncu — `CurrentPlayer()`'dan gelir, gövdeden ASLA (CLAUDE.md "SUNUCU OTORİTESİ"). */
  createdBy: string;
  name: string;
  /** brief §1/§7 "at sayısı" → `races.participant_limit`. */
  fieldSize: number;
  /** brief §1/§6 "maksimum oyuncu" → `races.max_players`. */
  maxPlayers: number;
  entryFee: number;
  raceType: 'free' | 'paid';
  startTime: Date;
  surface: string;
  weather: string;
  distanceMeters: number;
  tribuneFee: number;
  spectatorCapacity: number;
  /** brief §3 — yarış açıldığı anda 0'dır; katılımcılarla BÜYÜR (PHASE 1b). */
  prizePool: number;
  /**
   * **BİLİNÇLİ OLARAK `null`'dır — lobi yarışı seed'siz doğar.**
   *
   * Pratik yarışta (`run-practice-race`) seed, yarışla AYNI anda
   * üretilir çünkü yarış oracıkta koşar. Lobi yarışında ise arada
   * SAATLER, hatta günler vardır ve seed'in ERKEN üretilmesi gerçek bir
   * adalet sorunu doğurur:
   *
   *  1. Seed, `GET /races/:id/timeline` yanıtında istemciye GİDER (bkz.
   *     `get-race-timeline.use-case.ts` → `simulationSeed`). Yarış
   *     açıldığı anda seed sabitlenseydi, yarışı açan kişi kendi
   *     yarışının seed'ini okuyabilir, snapshot'ı yerel olarak kurup
   *     sonucu ÖNCEDEN hesaplayabilir ve "kazanacağımı biliyorum" diye
   *     katılırdı. Ücretli bir yarışta bu, doğrudan para kazanma yoludur.
   *  2. Daha sinsi olanı: seed erken sabitlenirse, katılımcı listesi
   *     seed'e GİRMEZ — yani bir oyuncu "hangi atlar katılırsa kazanırım"
   *     sorusunu deneyerek lobiyi yönlendirebilir.
   *
   * Seed'i YARIŞ KOŞARKEN üretmek iki sorunu birden kapatır: o anda
   * katılımcı listesi ZATEN kilitlidir (kayıt kapanmıştır) ve seed
   * kimseye — yarışı açana bile — önceden görünmez. Bu yüzden
   * `races.simulation_seed` sütunu `NULL` kabul eder (migration 0006,
   * `DEFAULT` yok) ve bu alan `null` geçilir.
   */
  simulationSeed: string | null;
  engineVersion: string;
  rulesetVersion: string;
  configVersion: string;
  weatherConfigVersion: string;
  /**
   * `RaceLobbyConfig.maxOpenRacesPerPlayer` — bu değer PORT'tan geçer
   * çünkü kontrolün `INSERT` ile AYNI transaction'da yapılması gerekir
   * (aşağıdaki `CreateLobbyRaceResult`'ın doc yorumu).
   */
  maxOpenRaces: number;
}

/**
 * `RaceRepository.createLobbyRace` sonucu.
 *
 * **NEDEN `null`/istisna DEĞİL, AYRIK BİR SONUÇ:** "tavan aşıldı" bir
 * HATA değil bir DURUMDUR ve `races` satırı YAZILMAMIŞTIR — bunu bir
 * istisnayla ifade etmek, repository'yi (Infrastructure katmanını) domain
 * hatası (`RaceLimitReachedError`) bilmeye zorlardı; oysa bu port
 * (docs/ARCHITECTURE.md §4) HTTP/domain hatası BİLMEZ, yalnızca olguları
 * döner. Hatayı fırlatmak `CreateRaceUseCase`'in işidir.
 *
 * **NEDEN SAYIM REPOSITORY'NİN İÇİNDE:** tavan kontrolü ile `INSERT`
 * ARASINDA bir boşluk olursa, aynı oyuncunun eşzamanlı iki isteği
 * ikisi de "2 açık yarışım var" görüp ikisi de yazabilir (tavan 3 iken 4
 * açık yarış). Bu yüzden sayım, `players` satırı `FOR UPDATE` ile
 * KİLİTLENEREK aynı transaction içinde yapılır — aynı oyuncunun eşzamanlı
 * oluşturma istekleri bu noktada SIRAYA girer.
 */
export type CreateLobbyRaceResult =
  | { ok: true; race: RaceLobbyView }
  | { ok: false; reason: 'RACE_LIMIT_REACHED'; openRaces: number };


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
  /** Seçilen kademenin `entryFee`'si (`config/economy.config.json` → `raceTiers[]`) — 0 ise düşüm/ledger girişi hiç yazılmaz. */
  entryFee: number;
  /** `getRacePrize`'dan — 0 ise ekleme/ledger girişi hiç yazılmaz. */
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
