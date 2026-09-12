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
  ListingNotFound: 'LISTING_NOT_FOUND',
  IdempotencyKeyRequired: 'IDEMPOTENCY_KEY_REQUIRED',
  ValidationError: 'VALIDATION_ERROR',
  Unauthorized: 'UNAUTHORIZED',
  NotFound: 'NOT_FOUND',
  // Faz 2 — At Pazarı (domain/market)
  ListingNotActive: 'LISTING_NOT_ACTIVE',
  ListingExpired: 'LISTING_EXPIRED',
  CannotBuyOwnListing: 'CANNOT_BUY_OWN_LISTING',
  InvalidListingPrice: 'INVALID_LISTING_PRICE',
  // Faz 2 — Jokey (domain/jockey)
  JockeyAlreadyOwned: 'JOCKEY_ALREADY_OWNED',
  // Faz 2 — Personel (domain/staff)
  StaffAlreadyHired: 'STAFF_ALREADY_HIRED',
  StaffContractExpired: 'STAFF_CONTRACT_EXPIRED',
  // Faz 2 — Ahır yükseltme (domain/stable)
  MaxStableLevelReached: 'MAX_STABLE_LEVEL_REACHED',
  // Faz 3 — Yetiştiricilik (domain/breeding)
  NotEligibleForBreeding: 'NOT_ELIGIBLE_FOR_BREEDING',
  // Faz 4 — Çiftlik / Tesisler (domain/farm)
  MaxFacilityLevelReached: 'MAX_FACILITY_LEVEL_REACHED',
  StaffCapacityExceeded: 'STAFF_CAPACITY_EXCEEDED',
  // FAZ 1 wiring — Player (domain/player)
  UsernameAlreadyTaken: 'USERNAME_ALREADY_TAKEN',
  PlayerNotFound: 'PLAYER_NOT_FOUND',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
