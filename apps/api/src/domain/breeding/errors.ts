/** Yetiştiricilik (breeding/genetics) domain'ine özgü hata tipleri (brief §28-29). */

export type BreedingIneligibilityReason =
  | 'SAME_HORSE'
  | 'INVALID_GENDER'
  | 'NOT_RETIRED'
  | 'TOO_YOUNG'
  | 'TOO_OLD'
  | 'FOAL_LIMIT_REACHED'
  | 'MARE_ON_COOLDOWN';

/**
 * 15.10.2026 — oyuncuya giden mesaj (eskiden kodun kendisiydi: "…uygun değil:
 * NOT_ACTIVE."). Kod yine tektir (`NOT_ELIGIBLE_FOR_BREEDING`); ayrım mesajda
 * ve `reason` alanındadır.
 */
const BREEDING_INELIGIBILITY_MESSAGES: Record<BreedingIneligibilityReason, string> = {
  SAME_HORSE: 'Aynı at hem kısrak hem aygır olamaz.',
  INVALID_GENDER: 'Çiftleştirme için bir kısrak ve bir aygır gerekir.',
  NOT_RETIRED: 'Damızlık için iki at da emekli olmalı (önce atı yarıştan emekli et).',
  TOO_YOUNG: 'Atlardan biri üremek için henüz çok genç.',
  TOO_OLD: 'Atlardan biri üremek için fazla yaşlı.',
  FOAL_LIMIT_REACHED: 'Atlardan biri ömrü boyunca verebileceği tay sınırına ulaştı.',
  MARE_ON_COOLDOWN: 'Kısrak son doğumundan sonra henüz dinlenmedi.',
};

export class NotEligibleForBreedingError extends Error {
  constructor(public readonly reason: BreedingIneligibilityReason) {
    super(BREEDING_INELIGIBILITY_MESSAGES[reason]);
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
