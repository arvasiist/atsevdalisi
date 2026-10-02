/**
 * Merkezi hata kodu kataloğu. docs/API.md §11 ile senkron tutulmalıdır.
 * Frontend'den bağımsız, sabit string literal union (brief §79).
 */
export const ErrorCode = {
  HorseTooTired: 'HORSE_TOO_TIRED',
  HorseInjured: 'HORSE_INJURED',
  InsufficientFunds: 'INSUFFICIENT_FUNDS',
  InsufficientEnergy: 'INSUFFICIENT_ENERGY',
  RaceFull: 'RACE_FULL',
  RaceAlreadyStarted: 'RACE_ALREADY_STARTED',
  // AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — `GET /races/:id/timeline`
  // uç noktası (bkz. `domain/race/errors.ts` `RaceNotFoundError`).
  RaceNotFound: 'RACE_NOT_FOUND',
  ListingNotFound: 'LISTING_NOT_FOUND',
  IdempotencyKeyRequired: 'IDEMPOTENCY_KEY_REQUIRED',
  /** AUDIT_AND_HARDENING Öncelik 3 (bu oturum) — bkz. `IdempotencyKeyInProgressError`. */
  IdempotencyKeyInProgress: 'IDEMPOTENCY_KEY_IN_PROGRESS',
  ValidationError: 'VALIDATION_ERROR',
  Unauthorized: 'UNAUTHORIZED',
  // 30.09.2026 — e-posta + şifre girişi (migration 0046). Kayıtlı olmayan
  // e-posta ile yanlış şifre BİLEREK aynı koddur (enumerasyon yok).
  InvalidCredentials: 'INVALID_CREDENTIALS',
  EmailAlreadyRegistered: 'EMAIL_ALREADY_REGISTERED',
  CredentialsAlreadySet: 'CREDENTIALS_ALREADY_SET',
  // Şifre sıfırlama bağlantısı geçersiz/süresi dolmuş/kullanılmış (migration 0047).
  InvalidResetToken: 'INVALID_RESET_TOKEN',
  // 02.10.2026 — oturum (migration 0057). Yenileme token'ı geçersiz/süresi
  // dolmuş/iptal edilmiş/yeniden kullanılmış — BİLEREK tek kod.
  InvalidRefreshToken: 'INVALID_REFRESH_TOKEN',
  SessionNotFound: 'SESSION_NOT_FOUND',
  // `POST /auth/session` yalnızca oturumsuz (eski) token'ı yükseltir.
  SessionUpgradeNotAllowed: 'SESSION_UPGRADE_NOT_ALLOWED',
  NotFound: 'NOT_FOUND',
  // AUDIT_REPORT.md Bulgu S1/S2/S4 hardening (bu oturum) — brief §41/§50
  // Google/Apple Sign-In + IDOR sertleştirmesi. `Unauthorized` (401) daha
  // önce taslakta duran ama hiç kullanılmayan bir kodtu — artık `AuthGuard`
  // eksik/geçersiz token'da bunu fırlatır. `Forbidden` (403) YENİ bir
  // koddur: token GEÇERLİDİR ama kimlik doğrulanmış oyuncu, istediği
  // kaynağın (at/ilan/oyuncu profili) SAHİBİ DEĞİLDİR — `Unauthorized`'dan
  // (kimlik hiç doğrulanamadı) kavramsal olarak FARKLIDIR, bu yüzden ayrı
  // bir koddur (bkz. `domain/auth/errors.ts` `ForbiddenError`).
  Forbidden: 'FORBIDDEN',
  // Sağlayıcı (Google/Apple) ID token'ı süresi dolmuş/geçersiz imza/yanlış
  // audience — `POST /auth/login`'e özgü, `Unauthorized`'dan (bizim KENDİ
  // JWT'imiz) kasıtlı olarak AYRI bir koddur (bkz. `domain/auth/errors.ts`
  // `InvalidProviderTokenError`).
  InvalidProviderToken: 'INVALID_PROVIDER_TOKEN',
  // 01.10.2026 — Google hesabı bağlama (`POST /auth/link`, migration 0048).
  // Bu Google hesabı BAŞKA bir oyuncuya bağlı / bu oyuncunun zaten başka bir
  // Google hesabı var.
  ProviderIdentityTaken: 'PROVIDER_IDENTITY_TAKEN',
  ProviderAlreadyLinked: 'PROVIDER_ALREADY_LINKED',
  // 01.10.2026 — kulüp (brief §44, migration 0049).
  ClubNotFound: 'CLUB_NOT_FOUND',
  ClubNameTaken: 'CLUB_NAME_TAKEN',
  ClubFull: 'CLUB_FULL',
  AlreadyClubMember: 'ALREADY_CLUB_MEMBER',
  NotClubMember: 'NOT_CLUB_MEMBER',
  InsufficientClubPermission: 'INSUFFICIENT_CLUB_PERMISSION',
  ClubLeaderCannotLeave: 'CLUB_LEADER_CANNOT_LEAVE',
  // Faz 2 — At Pazarı (domain/market)
  ListingNotActive: 'LISTING_NOT_ACTIVE',
  ListingExpired: 'LISTING_EXPIRED',
  // 02.10.2026 — müzayede.
  ListingIsAuction: 'LISTING_IS_AUCTION',
  ListingNotAuction: 'LISTING_NOT_AUCTION',
  BidTooLow: 'BID_TOO_LOW',
  CannotBidOwnListing: 'CANNOT_BID_OWN_LISTING',
  AuctionHasBids: 'AUCTION_HAS_BIDS',
  AuctionRequiresEndTime: 'AUCTION_REQUIRES_END_TIME',
  CannotBuyOwnListing: 'CANNOT_BUY_OWN_LISTING',
  InvalidListingPrice: 'INVALID_LISTING_PRICE',
  // FAZ 1 wiring, on üçüncü dilim (bu oturum) — `InvalidListingPriceError`
  // ile AYNI desen (bkz. domain/market/errors.ts `InvalidListingExpiryError`).
  InvalidListingExpiry: 'INVALID_LISTING_EXPIRY',
  // FAZ 1 wiring, on birinci dilim (bu oturum) — bir atın aynı anda
  // yalnızca tek bir aktif ilanı olabilir (bkz. domain/market/errors.ts
  // `HorseAlreadyListedError`).
  HorseAlreadyListed: 'HORSE_ALREADY_LISTED',
  // AUDIT_REPORT.md Bulgu D2 (bu oturum) — bkz. domain/market/errors.ts
  // `ListingStaleOwnerError`.
  ListingStaleOwner: 'LISTING_STALE_OWNER',
  // Faz 2 — Jokey (domain/jockey)
  JockeyAlreadyOwned: 'JOCKEY_ALREADY_OWNED',
  // Faz 2 — Personel (domain/staff)
  StaffAlreadyHired: 'STAFF_ALREADY_HIRED',
  StaffContractExpired: 'STAFF_CONTRACT_EXPIRED',
  StaffNotFound: 'STAFF_NOT_FOUND',
  StaffNotOwned: 'STAFF_NOT_OWNED',
  StaffRenewalNotDue: 'STAFF_RENEWAL_NOT_DUE',
  // Faz 2 — Ahır yükseltme (domain/stable)
  MaxStableLevelReached: 'MAX_STABLE_LEVEL_REACHED',
  // AUDIT_REPORT.md Bulgu C1 (bu oturum) — `StableCapacityExceededError`
  // FAZ 1'den beri domain katmanında hazırdı ama hiçbir yerde
  // fırlatılmıyordu (kod HTTP durumuna hiç eşlenmemişti); bkz.
  // `domain/stable/errors.ts` ve `postgres-market-purchase.repository.ts`.
  StableCapacityExceeded: 'STABLE_CAPACITY_EXCEEDED',
  // AUDIT_REPORT.md Bulgu H2 — `HorseListedInMarketError` (antrenman/yarış
  // yolu) FAZ 1'den beri fırlatılıyordu ama kodu `DOMAIN_ERROR_MAP`'e HAM
  // bir metin olarak yazılmıştı (`domain/horse/errors.ts`'te de ikinci bir
  // kopyası vardı). Çiftleştirme dilimi (27.09.2026) AYNI kodu PAYLAŞAN
  // ikinci bir hata (`BreedingHorseListedError`) eklediği için kopya
  // sayısı üçe çıkacaktı — bu yüzden kod artık TEK yerde, burada tanımlı.
  HorseListedInMarket: 'HORSE_LISTED_IN_MARKET',
  // 30.09.2026 — `HorseInActiveRaceError`: at, henüz koşulmamış (`scheduled`/
  // `locking`) bir lobi yarışına kayıtlıyken satılamaz, pazara çıkarılamaz ve
  // ikinci bir açık yarışa yazılamaz (bkz. `domain/horse/errors.ts`).
  HorseInActiveRace: 'HORSE_IN_ACTIVE_RACE',
  // 30.09.2026 — turnuvanın seviye şartı karşılanmadı (`PlayerLevelTooLowError`).
  PlayerLevelTooLow: 'PLAYER_LEVEL_TOO_LOW',
  // Faz 3 — Yetiştiricilik (domain/breeding)
  NotEligibleForBreeding: 'NOT_ELIGIBLE_FOR_BREEDING',
  // Faz 4 — Çiftlik / Tesisler (domain/farm)
  MaxFacilityLevelReached: 'MAX_FACILITY_LEVEL_REACHED',
  FacilityInactive: 'FACILITY_INACTIVE',
  InvalidPlayerControl: 'INVALID_PLAYER_CONTROL',
  InteractiveRaceNotFound: 'INTERACTIVE_RACE_NOT_FOUND',
  InteractiveRaceInProgress: 'INTERACTIVE_RACE_IN_PROGRESS',
  InteractiveRaceNotFinished: 'INTERACTIVE_RACE_NOT_FINISHED',
  InteractiveRaceClosed: 'INTERACTIVE_RACE_CLOSED',
  StaffCapacityExceeded: 'STAFF_CAPACITY_EXCEEDED',
  // FAZ 1 wiring — Player (domain/player)
  UsernameAlreadyTaken: 'USERNAME_ALREADY_TAKEN',
  PlayerNotFound: 'PLAYER_NOT_FOUND',
  // FAZ 1 wiring, ikinci dilim — Horse (domain/horse)
  HorseNotFound: 'HORSE_NOT_FOUND',
  // FAZ 1 wiring, beşinci dilim — Bakım (domain/care)
  CareActionOnCooldown: 'CARE_ACTION_ON_COOLDOWN',
  // FAZ 1 wiring, yedinci dilim — Günlük Ödül (domain/economy)
  DailyRewardAlreadyClaimed: 'DAILY_REWARD_ALREADY_CLAIMED',
  // FAZ 1 wiring, on dördüncü dilim (bu oturum) — PvP Eşleştirme (domain/online)
  AlreadyInMatchmakingQueue: 'ALREADY_IN_MATCHMAKING_QUEUE',
  NotInMatchmakingQueue: 'NOT_IN_MATCHMAKING_QUEUE',
  // AUDIT_REPORT.md Bulgu S5 (High) hardening (bu oturum) — bkz.
  // apps/api/src/api/rate-limit/rate-limit.errors.ts `RateLimitExceededError`.
  RateLimitExceeded: 'RATE_LIMIT_EXCEEDED',
  // claude/hizli-bitirme-plani.md'nin proje sahibi tarafından
  // önceliklendirdiği Ekipman dilimi (bu turda EKLENDİ) — bkz.
  // domain/equipment/errors.ts.
  HorseEquipmentNotFound: 'HORSE_EQUIPMENT_NOT_FOUND',
  // brief §12 Beslenme / yem dükkânı (bu turda EKLENDİ) — bkz.
  // domain/care/errors.ts. Dördü de `ValidationError`'a EZMEdilmedi:
  // istemcinin AYRI bir ekran/metin gösterebilmesi için (ör. "stok bitti"
  // → satın alma ekranına yönlendir) kavramsal olarak ayrıdırlar.
  /** Geçersiz yem kalemi adı (400). */
  InvalidFeedType: 'INVALID_FEED_TYPE',
  /** Kalem stokta yok — önce satın alınmalı (409). */
  InsufficientFeedStock: 'INSUFFICIENT_FEED_STOCK',
  /** Kalemin bu at için günlük sınırı doldu (409). */
  DailyFeedLimitReached: 'DAILY_FEED_LIMIT_REACHED',
  /** Kalem satın alınamaz — yalnızca bedava verilir (400). */
  FeedNotPurchasable: 'FEED_NOT_PURCHASABLE',
  /** Satın alma adedi geçersiz (400). */
  InvalidFeedPurchaseCount: 'INVALID_FEED_PURCHASE_COUNT',
  // Proje sahibinin açık talebi (27.09.2026) — "hazır olan kişiler
  // yarışabilsinler". `HorseTooTired`/`InsufficientEnergy` YENİDEN
  // KULLANILIR (antrenmandaki ile AYNI kavramlar); yalnızca yarışta
  // KARŞILIĞI OLMAYAN iki durum yeni kod alır: atın `active` olmaması ve
  // sağlığının yetersizliği. Hepsi 409 Conflict'tir (GEÇİCİ engeller).
  /** At `active` durumda değil (sakat değil ama dinlenmede/emekli) — 409. */
  HorseNotActive: 'HORSE_NOT_ACTIVE',
  /** Yarışa girmek için sağlık çok düşük (409). */
  InsufficientHealth: 'INSUFFICIENT_HEALTH',
  /** `tierId` config'deki hiçbir yarış kademesiyle eşleşmiyor (400). */
  InvalidRaceTier: 'INVALID_RACE_TIER',
  // Tribün (proje sahibinin açık talebi, 27.09.2026) — bkz.
  // domain/grandstand/errors.ts ve packages/shared-types/src/grandstand.ts.
  /** Bu yarışa zaten bilet alınmış (409). */
  RaceTicketAlreadyOwned: 'RACE_TICKET_ALREADY_OWNED',
  /** Yarış izlenebilir değil — henüz bitmedi, pencere kapandı ya da kendi yarışın (409). */
  RaceNotWatchable: 'RACE_NOT_WATCHABLE',
  /**
   * Yarışın tam alan replay verisini görme yetkisi yok: ne katılımcı ne
   * bilet sahibi (403). `GetRaceTimelineUseCase`'in 403'ünü EZER — istemci
   * "Bilet Al" ekranına yönlendirebilsin diye AYRI bir kod gerekir.
   */
  RaceTicketRequired: 'RACE_TICKET_REQUIRED',
  /**
   * Tribün KONTENJANI doldu — `races.spectator_capacity` kadar bilet
   * satıldı (409, `TribuneFullError`). PHASE 7.1, 29.09.2026.
   *
   * **Neden 409 (410/404 DEĞİL):** koltuk bir KAYNAK DURUMUDUR, kaynağın
   * yokluğu değil. `RaceTicketAlreadyOwned` ile AYNI kategori: istek
   * biçimsel olarak kusursuz, engelleyen şey o anki doluluk. İstemcinin
   * önereceği eylem "başka bir yarış seç"tir — bu yüzden ayrı kod
   * (`RACE_NOT_WATCHABLE`dan farkı: orada yarış hiç izlenemez, burada
   * yalnızca YER kalmadı).
   */
  RaceTribuneFull: 'RACE_TRIBUNE_FULL',
  /**
   * İzlenmiş bilet iade edilemez (409, `TicketAlreadyUsedError`) —
   * 30.09.2026, migration 0044 `race_tickets.first_viewed_at`.
   */
  TicketAlreadyUsed: 'TICKET_ALREADY_USED',
  /**
   * ÜCRETSİZ tribünlü bir yarışa bilet alınmaya çalışıldı (409,
   * `RaceTribuneFreeError`). PHASE 7.1, 29.09.2026.
   *
   * `races.tribune_fee = 0` "bu yarışın tribünü bedava" demektir — yani
   * izlemek için bilet GEREKMEZ (`canWatchRaceWithoutTicket`). Böyle bir
   * yarışa bilet satın almak anlamsızdır (0 tutarlı bir defter satırı
   * yazılamaz: `economy_transactions.amount <> 0` kısıtı). Bu kod,
   * o durumun sessizce "bedava bilet" ya da 500'e dönüşmesini engeller.
   */
  RaceTribuneFree: 'RACE_TRIBUNE_FREE',
  /**
   * İade edilecek bilet YOK (404, `RaceTicketNotFoundError`) — ya hiç
   * alınmamış ya da zaten iade edilmiş. PHASE 7.2, 29.09.2026.
   *
   * **Neden 404:** iade, var olan bir KAYNAĞI (`race_tickets` satırı)
   * hedefler; o satır yoksa hedef yoktur. Çift iadeyi engelleyen şey bu
   * koddur ve `DELETE ... RETURNING`in 0 satır döndürmesidir — ayrı bir
   * durum sütunu İCAT EDİLMEDİ (bkz. `refundTicket` doc yorumu).
   */
  RaceTicketNotFound: 'RACE_TICKET_NOT_FOUND',
  /**
   * Arkadaşlık + mesajlaşma (proje sahibinin açık talebi, 27.09.2026) —
   * aşağıdaki altı kod `domain/social/errors.ts`'in ürettikleridir.
   */
  /** Kendine arkadaşlık isteği gönderilemez (400). */
  CannotFriendSelf: 'CANNOT_FRIEND_SELF',
  /** Kendine mesaj gönderilemez (400). */
  CannotMessageSelf: 'CANNOT_MESSAGE_SELF',
  /** Bu oyuncuyla zaten bir arkadaşlık kaydı var — bekleyen ya da kabul edilmiş (409). */
  FriendshipAlreadyExists: 'FRIENDSHIP_ALREADY_EXISTS',
  /** İstenen arkadaşlık kaydı bulunamadı ya da bu oyuncuya ait değil (404). */
  FriendshipNotFound: 'FRIENDSHIP_NOT_FOUND',
  /** Mesaj göndermek için arkadaş olmak gerekir (403). */
  NotFriends: 'NOT_FRIENDS',
  /** Mesaj gövdesi boş, yalnızca boşluk ya da azami uzunluğu aşıyor (400). */
  InvalidMessageBody: 'INVALID_MESSAGE_BODY',
  /** Arkadaşlık isteği yanıtı `accept`/`reject` dışında bir değer (400). */
  InvalidFriendshipAction: 'INVALID_FRIENDSHIP_ACTION',
  /**
   * Arkadaş listesi ya da bekleyen istek tavanı aşıldı (409) — spam
   * savunması, bkz. `domain/social/errors.ts` `SocialLimitReachedError`.
   */
  SocialLimitReached: 'SOCIAL_LIMIT_REACHED',
  /**
   * BLOCK / REPORT (brief §33, §42 PHASE 15) — aşağıdaki altı kod
   * `domain/social/errors.ts`'in ürettikleridir.
   */
  /** Kaldırılacak engel kaydı yok (404). */
  BlockNotFound: 'BLOCK_NOT_FOUND',
  /** Kendini engelleyemezsin (400). */
  CannotBlockSelf: 'CANNOT_BLOCK_SELF',
  /**
   * Bu iki oyuncu arasında (HERHANGİ bir yönde) engel var (403).
   *
   * **NEDEN TEK KOD, İKİ YÖN İÇİN:** engelleyen taraf da engellenen taraf
   * da aynı cevabı alır. Yönü ayırt eden ikinci bir kod, engellenen
   * oyuncuya "seni engelledi" bilgisini sızdırırdı; oysa engellemenin
   * amacı tam olarak sessiz bir mesafedir. Engeli KOYAN taraf zaten
   * `GET /players/:id/blocks` ile listesini görür — bilgi orada,
   * kapıda değil.
   */
  PlayerBlocked: 'PLAYER_BLOCKED',
  /** Kendini şikâyet edemezsin (400). */
  CannotReportSelf: 'CANNOT_REPORT_SELF',
  /**
   * Şikâyet kategorisi `domain/social/moderation.ts` `REPORT_CATEGORIES`
   * dışında (400). `InvalidFriendshipAction` ile AYNI gerekçe: `@IsIn`
   * TEK BAŞINA YETMEZ (CLAUDE.md kural 5 — esbuild altında DTO
   * dekoratörleri atlanır), doğrulama domain'de YAPILIR.
   */
  InvalidReportCategory: 'INVALID_REPORT_CATEGORY',
  /**
   * Şikâyet gerekçesi geçersiz — metin değil ya da azami uzunluğu aşıyor
   * (400). `InvalidMessageBody` ile AYNI desen: BOŞ METİN GEÇERLİDİR ve
   * `null`a indirgenir (gerekçe isteğe bağlıdır).
   */
  InvalidReportReason: 'INVALID_REPORT_REASON',
  /**
   * Hediye gönderimi (proje sahibinin açık talebi, 27.09.2026) —
   * aşağıdaki beş kod `domain/gift/errors.ts`'in ürettikleridir. BU BİR
   * PARA YOLUDUR (bkz. `gift.repository.ts`).
   */
  /** Kendine hediye gönderilemez (400). */
  CannotGiftSelf: 'CANNOT_GIFT_SELF',
  /** Hediye miktarı geçersiz — tam sayı değil, ya da config'teki min/max dışında (400). */
  InvalidGiftAmount: 'INVALID_GIFT_AMOUNT',
  /** Bu para birimi hediye olarak gönderilemez (400) — bkz. `GiftConfig.allowedCurrencies`. */
  GiftCurrencyNotAllowed: 'GIFT_CURRENCY_NOT_ALLOWED',
  /**
   * Hediye göndermek için arkadaş olmak gerekir (403). `NOT_FRIENDS`'ten
   * AYRI bir koddur: kullanıcıya gösterilen metin farklıdır ("mesaj
   * gönderemezsin" ≠ "hediye gönderemezsin") ve istemci hediye ekranını
   * "önce arkadaş ekle" akışına yönlendirebilmelidir.
   */
  GiftRequiresFriendship: 'GIFT_REQUIRES_FRIENDSHIP',
  /** Son 24 saatteki hediye SAYISI tavanı aşıldı (409) — bkz. `GiftConfig.dailyLimit`. */
  DailyGiftLimitReached: 'DAILY_GIFT_LIMIT_REACHED',
  /**
   * Oyuncunun oluşturduğu ücretli yarış (brief §1-§7, §42 PHASE 1) —
   * aşağıdaki iki kod `domain/race/lobby.ts`'in ürettikleridir.
   */
  /**
   * Yarış tanımı geçersiz: ad uzunluğu, at sayısı (8/10/12/14/16 dışında),
   * giriş ücreti, mesafe, başlangıç zamanı, tribün ücreti/kapasitesi ya da
   * `raceType`–`entryFee` çelişkisi (400).
   *
   * **TEK KOD, ÇOK NEDEN** — bilinçlidir: `InvalidRaceTier`'ın aksine
   * burada istemcinin ayırt etmesi gereken bir şey yoktur, çünkü hata
   * mesajı hangi alanın neden reddedildiğini zaten söyler ve istemci
   * formu tümüyle yeniden doğrular. Her neden için ayrı bir kod eklemek,
   * `error-codes.ts`'i bir form doğrulama şemasına çevirirdi.
   */
  InvalidRaceDefinition: 'INVALID_RACE_DEFINITION',
  /**
   * Oyuncunun AÇIK yarış sayısı tavanı aşıldı (409) — bkz.
   * `RaceLobbyConfig.maxOpenRacesPerPlayer`. `SocialLimitReached`/
   * `DailyGiftLimitReached` ile AYNI gerekçeyle 400 DEĞİL 409: istek
   * biçimsel olarak kusursuzdur, engelleyen şey DURUMDUR (mevcut açık
   * yarışlar) ve o yarışlar bitince ya da iptal edilince kendiliğinden
   * ortadan kalkar.
   */
  RaceLimitReached: 'RACE_LIMIT_REACHED',
  /**
   * Katılım gövdesi geçersiz: `horseId` yok, UUID değil ya da yanlış tipte;
   * `tacticalStyle`/`riskLevel` bilinen bir değer değil (400).
   *
   * `InvalidRaceDefinition` ile AYNI gerekçeyle TEK kod: istemcinin ayırt
   * etmesi gereken bir şey yoktur, mesaj hangi alanın neden reddedildiğini
   * söyler. Bu kodun varlık sebebi ayrıca CLAUDE.md kural 5'tir — esbuild
   * altında DTO dekoratörleri atlanır, yani gövde çalışma anında gerçekten
   * bozuk olabilir ve bunu `domain/race/lobby.ts` bağımsız yakalar.
   */
  InvalidRaceJoinInput: 'INVALID_RACE_JOIN_INPUT',
  /**
   * Yarışa KATILINAMAZ — durumu `scheduled` değil ya da başlangıç zamanı
   * geçmiş (409). brief §2: katılım, yarış başlayana kadar açıktır.
   */
  RaceNotJoinable: 'RACE_NOT_JOINABLE',
  /**
   * NOT: `RACE_FULL` bu dosyanın BAŞINDA (yukarıda, `RaceFull`) zaten
   * tanımlıdır — PHASE 1b'de ikinci kez eklenmiş ve `TS1117` (aynı adlı
   * çift anahtar) üretmişti. Katılım yolundaki anlamı: yarışın oyuncu
   * kontenjanı doldu (409), bkz. `races.max_players` (brief §6
   * "MAX_PLAYERS"). Kalan at koltukları yapay zekâyla doldurulur, ama
   * GERÇEK oyuncu sayısı `max_players`'ı aşamaz.
   */
  /**
   * Oyuncu bu yarışa zaten katılmış (409). Kural veritabanında ZORLANIR:
   * `race_entries_race_player_uq` kısmi tekil indeksi (migration 0037) bir
   * oyuncunun aynı yarışa İKİ atla girmesini engeller.
   */
  AlreadyJoinedRace: 'ALREADY_JOINED_RACE',
  /**
   * READY gövdesi geçersiz (400) — `status` yok, metin değil ya da
   * `ready`/`not_ready` dışında bir değer. `POST /races/:id/ready`
   * (brief §6, §42 PHASE 3).
   *
   * **`waiting` ve `cancelled` BİLİNÇLİ OLARAK SEÇİLEMEZ:** `waiting`
   * "henüz karar vermedim"in kaydıdır ve geri dönülemez; `cancelled` ise
   * bir İADE politikası gerektiren ayrı bir iştir (bkz.
   * `domain/race/lobby.ts` → `READY_SETTABLE_STATUSES`).
   */
  InvalidEntryReadyInput: 'INVALID_ENTRY_READY_INPUT',
  /**
   * Oyuncunun bu yarışta katılım satırı yok (404) —
   * `POST /races/:id/ready` (brief §6, §42 PHASE 3). 403 değil 404:
   * üzerinde işlem yapılacak kaynağın KENDİSİ yoktur.
   */
  RaceEntryNotFound: 'RACE_ENTRY_NOT_FOUND',
  /**
   * Katılım durumu şu an değiştirilemez (409): yarış `scheduled` değil,
   * başlangıç zamanı geçmiş ya da katılım iptal edilmiş —
   * `POST /races/:id/ready` (brief §6, §42 PHASE 3).
   */
  RaceEntryNotReadyable: 'RACE_ENTRY_NOT_READYABLE',
  /**
   * Yarıştan ayrılma şu an yapılamaz (409): yarış `scheduled` değil,
   * başlangıç zamanı gelmiş/geçmiş ya da katılım zaten iptal edilmiş —
   * `POST /races/:id/leave` (brief §20 REFUND, §42 PHASE 4c).
   *
   * **NEDEN 409:** istek biçimsel olarak kusursuzdur ve kaynak (oyuncunun
   * katılımı) vardır; engelleyen şey KAYNAĞIN DURUMUDUR. Ayrılma geri
   * alınamaz biçimde ücret iadesi doğurduğu için "önce uygun duruma getir,
   * sonra tekrar dene" yolu YOKTUR — istemci bu kodu görünce beklemeyi
   * bırakmalıdır. (`RaceEntryNotReadyable` ile AYNI kategori.)
   */
  RaceEntryNotLeavable: 'RACE_ENTRY_NOT_LEAVABLE',
  /**
   * Oyuncu bu yarıştaki katılımını DAHA ÖNCE iptal etmiş (409) —
   * `POST /races/:id/join` (brief §20 REFUND, §42 PHASE 4c).
   *
   * **NEDEN AYRI KOD:** eski davranış `ALREADY_JOINED_RACE` dönmek
   * olurdu, ama o mesaj YANLIŞTIR — oyuncu yarışta DEĞİLDİR, iptal
   * etmiştir ve yeniden katılması BİLİNÇLİ olarak engellenmiştir
   * (`race_entries_race_player_uq` tekilliği `status`'tan bağımsızdır;
   * ayrıl-katıl döngüsü READY bayrağını sıfırlayıp oyuncuya havuzu
   * oynama imkânı verirdi — gerekçenin tamamı `RaceEntryCancelledError`
   * doc yorumunda).
   */
  RaceEntryCancelled: 'RACE_ENTRY_CANCELLED',
  /**
   * Ödül dağıtımı şu an yapılamaz (409): yarış `scheduled` değil (zaten
   * koşulmuş/iptal edilmiş), başlangıç saati gelmemiş, ya da yarışa hiç
   * GERÇEK oyuncu katılmamış — `POST /races/:id/settle` (§42 PHASE 13.14).
   *
   * **NEDEN 409:** istek biçimsel olarak kusursuzdur; engelleyen şey
   * YARIŞIN DURUMUDUR (`RaceEntryNotLeavable` ile AYNI kategori).
   *
   * **BU KOD AYNI ZAMANDA İDEMPOTENCY'NİN KENDİSİDİR.** Settlement ucu
   * Idempotency-Key kullanmaz; ikinci çağrı bu kodu alır, yani ikinci bir
   * ödeme YAPISAL OLARAK imkânsızdır. İstemci bu kodu "hata" değil,
   * "sonuç zaten kesinleşti" diye okumalıdır — ödülü öğrenmek için
   * `GET /races/:id/timeline` ya da bildirimler kullanılır.
   */
  RaceNotSettleable: 'RACE_NOT_SETTLEABLE',
  /**
   * SANAL para yatırma KAPALI (403) — brief §21/§41, §42 PHASE 4b.
   * `domain/economy/errors.ts` → `MockDepositDisabledError`.
   *
   * **NEDEN 403 (404/409 DEĞİL):** istek biçimsel olarak kusursuzdur ve
   * kaynak da vardır; engelleyen şey SUNUCU TARAFINDAKİ bir yapılandırma
   * kararıdır — yani "kimlik doğrulandı, bu işlem bu sunucuda yapılamaz"
   * (`RaceTicketRequiredError` ile AYNI kategori). 409 olamaz çünkü
   * duruma bağlı GEÇİCİ bir engel değildir; 404 olamaz çünkü kaynak
   * (oyuncunun cüzdanı) gerçekten vardır.
   *
   * Bu kod üretimde (NODE_ENV=production) HER ZAMAN döner: mock sağlayıcı
   * orada kendini kapalı ilan eder (bkz. `MockPaymentProvider.isEnabled`).
   */
  MockDepositDisabled: 'MOCK_DEPOSIT_DISABLED',
  /**
   * Yatırma tutarı geçersiz (400): tam sayı değil, sıfır/negatif, ya da
   * `economy.config.json` → `mockDeposit.minAmount`/`maxAmount` aralığının
   * dışında — `domain/economy/errors.ts` → `InvalidDepositAmountError`.
   *
   * **`ValidationError` DEĞİL, KENDİ KODU:** bu uç noktanın gövdesi
   * (`{ amount }`) `ValidationPipe`'a BIRAKILAMAZ — CLAUDE.md kural 5
   * gereği esbuild altında DTO dekoratörleri atlanır, yani doğrulama
   * ÇALIŞMA ANINDA domain katmanında yapılır (bkz.
   * `domain/economy/mock-deposit.ts`). İstemcinin "hangi alan bozuk"
   * sorusunu ayırt edebilmesi için (bu, tek alanlı bir uçtur — mesaj
   * zaten nedeni söyler, ama kod da tutarlı olmalı) kendi kodu vardır;
   * `InvalidGiftAmount` ile AYNI desen ve AYNI gerekçe.
   */
  InvalidDepositAmount: 'INVALID_DEPOSIT_AMOUNT',
  /**
   * Yarış daveti + bildirim (brief §16 RACE INVITE, §28, §42 PHASE 11) —
   * aşağıdaki sekiz kod `domain/social/errors.ts`'in ürettikleridir.
   */
  /** Kendini yarışa davet edemezsin (400). */
  CannotInviteSelf: 'CANNOT_INVITE_SELF',
  /**
   * Davet göndermek için arkadaş olmak gerekir (403) — brief §16
   * "Arkadaşlar birbirlerini yarışa davet edebilsin".
   *
   * `NotFriends`/`GiftRequiresFriendship` ile AYNI gerekçeyle AYRI kod:
   * kullanıcıya gösterilen metin farklıdır ve istemci "önce arkadaş ekle"
   * akışına yönlendirebilmelidir. `NOT_FRIENDS`'i yeniden kullanmak,
   * istemciye "mesaj mı, hediye mi, davet mi gönderemedim" sorusunu
   * cevapsız bırakırdı.
   */
  InviteRequiresFriendship: 'INVITE_REQUIRES_FRIENDSHIP',
  /** Davet bulunamadı ya da bu oyuncuya ait değil (404). */
  RaceInviteNotFound: 'RACE_INVITE_NOT_FOUND',
  /**
   * Davet zaten yanıtlanmış — `accept`/`decline` dışında bir durumda (409).
   * `pending` bir davet yanıtlanabilir; `accepted`/`declined`/`expired`
   * yanıtlanamaz (geri alınamaz — aynı davet iki kez kabul edilemez).
   */
  RaceInviteNotRespondable: 'RACE_INVITE_NOT_RESPONDABLE',
  /**
   * Bu yarışa şu an davet GÖNDERİLEMEZ (409): yarış `scheduled` değil ya da
   * başlangıç zamanı geçmiş — `checkRaceJoinable`ın davete uyarlanmış hâli.
   *
   * **NEDEN KATILIMDAN AYRI KOD:** `RaceNotJoinable` mesajı "katılamazsın"
   * der; oysa burada engellenen şey DAVETTİR. İstemcinin davet düğmesini
   * gizlemesi için hangi işlemin engellendiği ayrı olmalıdır.
   */
  RaceNotInvitable: 'RACE_NOT_INVITABLE',
  /**
   * Bu oyuncu bu yarışa ZATEN davet edilmiş (409) — kural veritabanında
   * ZORLANIR: `race_invites_race_invitee_uq` tekil indeksi (migration 0039).
   * `FriendshipAlreadyExists` ile AYNI desen.
   */
  RaceInviteAlreadyExists: 'RACE_INVITE_ALREADY_EXISTS',
  /** Davet yanıtı `accept`/`decline` dışında bir değer (400). */
  InvalidRaceInviteAction: 'INVALID_RACE_INVITE_ACTION',
  /**
   * Bildirim bulunamadı ya da bu oyuncuya ait değil (404) —
   * `POST /players/:id/notifications/:notificationId/read`. 403 değil 404:
   * üzerinde işlem yapılacak kaynağın KENDİSİ yoktur (`RaceEntryNotFound`
   * ile AYNI gerekçe — başkasının bildirim kimliğini denemek de aynı yanıtı
   * alır, yani kimlik varlığı sızdırılmaz).
   */
  NotificationNotFound: 'NOTIFICATION_NOT_FOUND',
  /**
   * Yönetim (admin) uçları (brief §34, §42 PHASE 15-B) — aşağıdaki üç kod
   * `domain/admin/errors.ts`'in ürettikleridir.
   */
  /**
   * Bu uç nokta yalnızca yöneticiler içindir (403) —
   * `domain/admin/errors.ts` → `AdminRequiredError`.
   *
   * **`Forbidden`'DAN AYRI BİR KOD:** `FORBIDDEN` "bu kaynak SENİN değil"
   * demektir (`assertSelf`/IDOR kapıları); burada ise oyuncunun kendi
   * kaynağıyla hiç ilgisi yoktur — eksik olan şey ROLDÜR. İstemci
   * `FORBIDDEN` görünce "başka bir hesaba geçmeliyim", bu kodu görünce
   * "bu ekran bana hiç görünmemeli" sonucunu çıkarır; ikisini tek kodda
   * birleştirmek yönetim ekranını yanlışlıkla açık bırakırdı.
   *
   * **ROL VERİTABANINDAN OKUNUR, TOKEN'DAN DEĞİL.** `players.is_admin`
   * her istekte tazelenir; yetkisi alınan bir yönetici, elindeki eski
   * token'la erişmeye devam EDEMEZ (rol token'a gömülseydi, iptal ancak
   * token süresi dolunca etki ederdi).
   */
  AdminRequired: 'ADMIN_REQUIRED',
  /**
   * Şikâyet kaydı bulunamadı (404) — `AdminRequiredError`'DAN SONRA
   * kontrol edilir: yönetici olmayan bir çağırana şikâyetin VAR OLUP
   * OLMADIĞI bilgisi verilmez.
   */
  ReportNotFound: 'REPORT_NOT_FOUND',
  /**
   * Şikâyet durumu geçersiz (400): metin değil, bilinen dört değerden
   * biri değil, ya da mevcut durumdan bu duruma GEÇİŞ yasak (örn.
   * `resolved` → `open`).
   *
   * **İKİ NEDEN TEK KOD:** istemcinin ayırt etmesi gereken bir şey yok —
   * mesaj hangi geçişin neden reddedildiğini söyler ve istemci kuyruğu
   * zaten sunucudan okur (`InvalidRaceDefinition` ile AYNI gerekçe).
   */
  InvalidReportStatus: 'INVALID_REPORT_STATUS',
  /**
   * Yarış, bulunduğu durumdan İPTAL EDİLEMEZ (409) — brief §34 "Race:
   * Create Cancel Pause Finish işlemleri kontrollü şekilde yapılabilmeli."
   *
   * **NEDEN 409, 400 DEĞİL:** istek kusurlu değildir; yarış artık o
   * işleme açık değildir (`RaceNotSettleable`/`RaceEntryNotLeavable` ile
   * AYNI kategori — "durum uygun değil"). İstemcinin yapacağı şey
   * isteği düzeltmek değil, listeyi tazelemektir.
   *
   * **İPTAL YALNIZCA `scheduled` İÇİN GEÇERLİDİR.** Koşmuş bir yarışı
   * iptal etmek, dağıtılmış ödülleri geri almak demek olurdu; koşan bir
   * yarışı iptal etmek ise simülasyonun ortasından para iade etmek —
   * ikisi de bu projede tanımlı DEĞİLDİR ve uydurulmamalıdır.
   */
  RaceNotCancelable: 'RACE_NOT_CANCELABLE',
  /**
   * JOKEY (brief §13, §42 PHASE 6.2) — aşağıdaki üç kod
   * `domain/jockey/errors.ts`'in ürettikleridir.
   */
  /**
   * Jokey bulunamadı (404) — `JockeyNotFoundError`. Okuma uçları
   * (`GET /players/:id/jockey`) bunu DÖNDÜRMEZ: jokeyi olmayan bir oyuncu
   * bir hata değil, `jockey: null` yanıtıdır. Bu kod yalnızca kiralama
   * ucunun `:jockeyId`si için vardır.
   */
  JockeyNotFound: 'JOCKEY_NOT_FOUND',
  /**
   * ⚠️ `JockeyAlreadyOwned` BURADA **YENİDEN TANIMLANMAZ** — değeri
   * yukarıda (Faz 2 bloğunda, satır ~52) FAZ 2'DEN BERİ duruyor ve
   * `JOCKEY_ALREADY_OWNED`'dir. Aynı anahtarı burada ikinci kez yazmak
   * `tsc` hatası verir (TS1117) — yani sessiz kalamaz; ama doğrusu değeri
   * KOPYALAMAK değil, tek bir yerde tutmaktır. `JockeyAlreadyOwnedError`
   * PHASE 6.2'de yeniden kullanıldı, yeniden ADLANDIRILMADI.
   *
   * Gerekçe (kodun kendisi): istek biçimsel olarak kusursuzdur; engelleyen
   * şey KAYNAĞIN DURUMUDUR (`RaceTicketAlreadyOwned` ile AYNI kategori).
   * `JockeyAlreadyHired`den AYRI kod — istemcinin önereceği eylem farklı:
   * orada "başka jokey seç", burada "önce mevcut jokeyini bırak".
   */
  /**
   * Oyuncunun ZATEN bir jokeyi var (409) — `JockeyAlreadyHiredError`.
   * Bir oyuncu en fazla bir jokey kiralayabilir; bu kural bir DB kısıtıyla
   * DEĞİL, kiralama yolunun kendisiyle korunur (bkz. `JockeyRepository`
   * port doc yorumu).
   */
  JockeyAlreadyHired: 'JOCKEY_ALREADY_HIRED',
  /**
   * Jokey SENİN DEĞİL — serbest bırakma reddi (409).
   * `POST /jockeys/:jockeyId/release` (29.09.2026, FINAL_PROJECT_AUDIT #18).
   *
   * **NEDEN `JOCKEY_NOT_FOUND` YETMEZ:** jokey vardır, kimliği de herkese
   * açık vitrinde (`GET /jockeys`) görünür — yani "yok" demek yanlış
   * olurdu. Engelleyen şey KAYNAĞIN DURUMUDUR: `owner_id` ya `NULL`dır
   * (zaten serbest, ya da hiç kiralanmamış) ya da BAŞKA bir oyuncudadır.
   * `JockeyAlreadyOwned` ("başkasında") ile birleştirmek, sahipsiz bir
   * jokeyi bırakmaya çalışan istemciye yanlış bir cümle kurardı.
   *
   * **BU KOD YÖN SIZDIRMAZ.** İki alt durum (sahipsiz / başkasının) TEK
   * kod ve TEK mesajla döner; ayrılsaydı bir oyuncu kimlik deneyerek
   * "bu jokey birinin mi" sorusunu yoklayabilirdi. Aynı gerekçe
   * `PLAYER_BLOCKED` için de geçerlidir (PROJE_DURUMU §13.16).
   */
  JockeyNotOwned: 'JOCKEY_NOT_OWNED',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
