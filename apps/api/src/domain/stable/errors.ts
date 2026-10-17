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

/**
 * 16.10.2026 — ahır geliştirme: sonraki seviye oyuncu seviyesi şartı ister
 * (409, `EquipmentLevelLockedError` ile aynı sınıf). Para düşmeden kesilir.
 */
export class StableUpgradeLevelLockedError extends Error {
  constructor(
    public readonly playerLevel: number,
    public readonly requiredLevel: number,
  ) {
    super(`Ahırı bu seviyeye yükseltmek için en az ${requiredLevel}. oyuncu seviyesi gerekir (şu an ${playerLevel}).`);
    this.name = 'StableUpgradeLevelLockedError';
  }
}
