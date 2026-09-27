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

/**
 * Çiftleştirmede KISRAK olarak kullanılmak istenen at, isteği yapan
 * oyuncuya ait değil → **403 FORBIDDEN** (bkz. `domain/auth/errors.ts`
 * `ForbiddenError` ile AYNI kategori: kimlik doğrulandı ama yetki yok).
 *
 * **Yalnızca kısrak için vardır; AYGIR başkasının olabilir** — gerçek
 * atçılıkta da olduğu gibi, aygır sahibine damızlık ücreti ödenir
 * (`breeding_pairs.fee`). Kısrağın sahibi çağırandır çünkü tay onun
 * ahırına doğar ve ücreti ödeyen odur.
 */
export class MareNotOwnedError extends Error {
  constructor(public readonly horseId: string) {
    super(`At (${horseId}) size ait olmadığı için kısrak olarak kullanılamaz.`);
    this.name = 'MareNotOwnedError';
  }
}

/**
 * Kısrak veya aygır pazarda AKTİF ilanda — çiftleştirilemez
 * (`HorseListedInMarketError` ile AYNI gerekçe ve AYNI kod: satışta olan
 * bir atın soy kaydını değiştirmek, alıcıya sürpriz bir tay/soy devreder).
 */
export class BreedingHorseListedError extends Error {
  constructor(public readonly horseId: string) {
    super(`At (${horseId}) pazarda satışta olduğu için çiftleştirilemez.`);
    this.name = 'BreedingHorseListedError';
  }
}
