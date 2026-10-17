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

/** 16.10.2026 — ahır bölmeleri: bölme numarası pozitif tam sayı olmalı (400). */
export class InvalidStallNumberError extends Error {
  constructor() {
    super('Bölme numarası pozitif bir tam sayı olmalı.');
    this.name = 'InvalidStallNumberError';
  }
}

/** Kapasitenin ötesindeki bölme henüz açılmadı (409) — ahırı geliştirerek açılır. */
export class StallLockedError extends Error {
  constructor(
    public readonly stallNumber: number,
    public readonly capacity: number,
  ) {
    super(`${stallNumber}. bölme henüz kilitli (ahır kapasitesi ${capacity}). Ahırı geliştirerek açabilirsin.`);
    this.name = 'StallLockedError';
  }
}

/** Taşınmak istenen at oyuncunun ahırında değil (404 — başkasının atını yoklamak bilgi vermez). */
export class HorseNotInStableError extends Error {
  constructor(public readonly horseId: string) {
    super('At ahırında bulunamadı.');
    this.name = 'HorseNotInStableError';
  }
}
