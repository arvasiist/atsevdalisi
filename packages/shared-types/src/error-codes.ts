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
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
