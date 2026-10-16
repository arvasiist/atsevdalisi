/**
 * Görev / etkinlik hataları (02.10.2026, Faz 11-B). Saf TS; hepsi
 * `http-exception.filter.ts` → `DOMAIN_ERROR_MAP`'e kayıtlıdır.
 */

/** Görev ya da etkinlik yok, arşivlenmiş ya da talep penceresi dışında (404). */
export class QuestNotFoundError extends Error {
  constructor() {
    super('Görev bulunamadı ya da şu an ödülü alınamaz.');
    this.name = 'QuestNotFoundError';
  }
}

export class QuestNotCompletedError extends Error {
  constructor(progress: number, target: number) {
    super(`Görev henüz tamamlanmadı (${progress}/${target}).`);
    this.name = 'QuestNotCompletedError';
  }
}

export class QuestAlreadyClaimedError extends Error {
  constructor() {
    super('Bu görevin ödülü bu dönem için zaten alındı.');
    this.name = 'QuestAlreadyClaimedError';
  }
}

export class InvalidLiveEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLiveEventError';
  }
}

export class LiveEventNotFoundError extends Error {
  constructor() {
    super('Etkinlik bulunamadı ya da zaten arşivlenmiş.');
    this.name = 'LiveEventNotFoundError';
  }
}

export class LiveEventLimitReachedError extends Error {
  constructor(max: number) {
    super(`Aynı anda en fazla ${max} etkinlik açık olabilir; önce birini arşivle.`);
    this.name = 'LiveEventLimitReachedError';
  }
}
