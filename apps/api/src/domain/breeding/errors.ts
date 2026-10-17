/** Yetiştiricilik (breeding/genetics) domain'ine özgü hata tipleri (brief §28-29). */

export type BreedingIneligibilityReason =
  | 'SAME_HORSE'
  | 'INVALID_GENDER'
  | 'NOT_RETIRED'
  | 'TOO_YOUNG'
  | 'TOO_OLD'
  | 'FOAL_LIMIT_REACHED'
  | 'MARE_ON_COOLDOWN'
  // 16.10.2026 — gebelik (brief §5).
  | 'MARE_PREGNANT'
  | 'MARE_RESTING';

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
  MARE_PREGNANT: 'Kısrak zaten gebe.',
  MARE_RESTING: 'Kısrak son tutmayan denemeden sonra dinleniyor; biraz sonra yeniden dene.',
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

// ---------------------------------------------------------------------------
// 16.10.2026 — çiftleştirme merkezi (brief §4)
// ---------------------------------------------------------------------------

/** Başkasının aygırıyla çiftleştirme yalnızca kabul edilmiş teklifle olur. */
export class BreedingRequiresAgreementError extends Error {
  constructor() {
    super('Başka bir oyuncunun aygırı için önce çiftleştirme teklifi gönder; aygır sahibi kabul etmeden çiftleştirme yapılamaz.');
    this.name = 'BreedingRequiresAgreementError';
  }
}

export class StudListingNotFoundError extends Error {
  constructor(public readonly stallionId: string) {
    super('Bu aygır şu an damızlık ilanında değil.');
    this.name = 'StudListingNotFoundError';
  }
}

export class StudFeeOutOfBoundsError extends Error {
  constructor(
    public readonly min: number,
    public readonly max: number,
  ) {
    super(`Damızlık ücreti ${min} ile ${max} çip arasında bir tam sayı olmalı.`);
    this.name = 'StudFeeOutOfBoundsError';
  }
}

export class BreedingOfferNotFoundError extends Error {
  constructor(public readonly offerId: string) {
    super('Çiftleştirme teklifi bulunamadı.');
    this.name = 'BreedingOfferNotFoundError';
  }
}

export class BreedingOfferNotPendingError extends Error {
  constructor(public readonly status: string) {
    super(`Teklif artık bekleyen durumda değil (${status}).`);
    this.name = 'BreedingOfferNotPendingError';
  }
}

export class BreedingOfferExpiredError extends Error {
  constructor() {
    super('Teklifin süresi doldu; ücret kısrak sahibine iade edilir.');
    this.name = 'BreedingOfferExpiredError';
  }
}

export class BreedingOfferAlreadyPendingError extends Error {
  constructor() {
    super('Bu kısrak için zaten yanıt bekleyen bir teklifin var.');
    this.name = 'BreedingOfferAlreadyPendingError';
  }
}

export class BreedingOfferOwnStallionError extends Error {
  constructor() {
    super('Kendi aygırın için teklif gerekmez; doğrudan çiftleştirebilirsin.');
    this.name = 'BreedingOfferOwnStallionError';
  }
}

export class PregnancyNotFoundError extends Error {
  constructor(public readonly pregnancyId: string) {
    super('Gebelik bulunamadı.');
    this.name = 'PregnancyNotFoundError';
  }
}

export class PregnancyCheckupTooSoonError extends Error {
  constructor(public readonly availableAt: Date) {
    super('Veteriner kontrolü henüz yapılamaz; bir sonraki kontrol zamanını bekle.');
    this.name = 'PregnancyCheckupTooSoonError';
  }
}

/** Gebe kısrak ya da bekleyen teklifi olan at satışa çıkarılamaz. */
export class HorseBreedingCommitmentError extends Error {
  constructor(public readonly horseId: string) {
    super('Bu at gebe ya da yanıt bekleyen bir çiftleştirme teklifinde; önce teklifi sonuçlandır ya da doğumu bekle.');
    this.name = 'HorseBreedingCommitmentError';
  }
}
