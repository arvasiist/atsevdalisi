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
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
