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
