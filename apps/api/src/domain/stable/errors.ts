/** Ahır (stable) domain'ine özgü hata tipleri (brief §32, §38-39). */

export class StableCapacityExceededError extends Error {
  constructor(
    public readonly capacity: number,
  ) {
    super(`Ahır kapasitesi (${capacity}) dolu — yeni at eklenemez.`);
    this.name = 'StableCapacityExceededError';
  }
}

/** FAZ 2 — `stable.config.json`'da tanımlı en yüksek seviyeye ulaşıldığında fırlatılır. */
export class MaxStableLevelReachedError extends Error {
  constructor(public readonly currentLevel: number) {
    super(`Ahır zaten en yüksek seviyede (${currentLevel}) — daha fazla yükseltilemez.`);
    this.name = 'MaxStableLevelReachedError';
  }
}
