/** Başarım hataları (03.10.2026). Hepsi `http-exception.filter.ts` → `DOMAIN_ERROR_MAP`'te. */

export class AchievementNotFoundError extends Error {
  constructor() {
    super('Başarım bulunamadı.');
    this.name = 'AchievementNotFoundError';
  }
}

export class AchievementNotCompletedError extends Error {
  constructor(progress: number, target: number) {
    super(`Başarım henüz açılmadı (${progress}/${target}).`);
    this.name = 'AchievementNotCompletedError';
  }
}

export class AchievementAlreadyClaimedError extends Error {
  constructor() {
    super('Bu başarımın ödülü zaten alındı.');
    this.name = 'AchievementAlreadyClaimedError';
  }
}
