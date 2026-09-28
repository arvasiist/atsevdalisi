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
  // Faz 2 — At Pazarı (domain/market)
  ListingNotActive: 'LISTING_NOT_ACTIVE',
  ListingExpired: 'LISTING_EXPIRED',
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
  // Faz 3 — Yetiştiricilik (domain/breeding)
  NotEligibleForBreeding: 'NOT_ELIGIBLE_FOR_BREEDING',
  // Faz 4 — Çiftlik / Tesisler (domain/farm)
  MaxFacilityLevelReached: 'MAX_FACILITY_LEVEL_REACHED',
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
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
