/** Horse domain'ine özgü hata tipleri (bkz. `domain/player/errors.ts` ile aynı desen). */

export class InvalidHorseNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidHorseNameError';
  }
}

/** FAZ 1 wiring — `GET /horses/:id` gibi uç noktalarda bulunamayan at. */
export class HorseNotFoundError extends Error {
  constructor(public readonly horseId: string) {
    super(`At (${horseId}) bulunamadı.`);
    this.name = 'HorseNotFoundError';
  }
}

/**
 * FAZ 1 wiring, dördüncü dilim — sakat (`status: 'injured'`) bir at
 * antrenmana alınamaz (docs/API.md §4 olası hata: `HORSE_INJURED`).
 */
export class HorseInjuredError extends Error {
  constructor(public readonly horseId: string) {
    super(`At (${horseId}) sakat, bu işlem şu anda yapılamaz.`);
    this.name = 'HorseInjuredError';
  }
}
/**
 * AUDIT_REPORT.md Bulgu H2 (Medium) — pazarda aktif ilanı olan bir at
 * antrenmana veya yarışa sokulamaz.
 */
export class HorseListedInMarketError extends Error {
  readonly code = 'HORSE_LISTED_IN_MARKET';

  constructor(public readonly horseId: string) {
    super(`At (${horseId}) pazarda satışta olduğu için bu işlem yapılamaz.`);
    this.name = 'HorseListedInMarketError';
  }
}
