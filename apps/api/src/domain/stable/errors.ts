/** Ahır (stable) domain'ine özgü hata tipleri (brief §32, §38-39). */

export class StableCapacityExceededError extends Error {
  constructor(
    public readonly capacity: number,
  ) {
    super(`Ahır kapasitesi (${capacity}) dolu — yeni at eklenemez.`);
    this.name = 'StableCapacityExceededError';
  }
}
