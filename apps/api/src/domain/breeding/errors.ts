/** Yetiştiricilik (breeding/genetics) domain'ine özgü hata tipleri (brief §28-29). */

export type BreedingIneligibilityReason =
  | 'SAME_HORSE'
  | 'INVALID_GENDER'
  | 'NOT_ACTIVE'
  | 'TOO_YOUNG'
  | 'TOO_OLD'
  | 'MARE_ON_COOLDOWN';

export class NotEligibleForBreedingError extends Error {
  constructor(public readonly reason: BreedingIneligibilityReason) {
    super(`Bu çift üreme için uygun değil: ${reason}.`);
    this.name = 'NotEligibleForBreedingError';
  }
}
