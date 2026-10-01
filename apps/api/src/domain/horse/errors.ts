/** Horse domain'ine özgü hata tipleri (bkz. `domain/player/errors.ts` ile aynı desen). */

// `ErrorCode` `@at-sevdalisi/shared-types`'tadır — framework'süz saf TS
// olduğundan domain katmanına girmesi KATMAN YÖNÜNÜ bozmaz (CLAUDE.md
// kural 4 yalnızca NestJS/ORM importunu yasaklar).
import { ErrorCode } from '@at-sevdalisi/shared-types';

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
  readonly code = ErrorCode.HorseListedInMarket;

  constructor(public readonly horseId: string) {
    super(`At (${horseId}) pazarda satışta olduğu için bu işlem yapılamaz.`);
    this.name = 'HorseListedInMarketError';
  }
}

/**
 * 30.09.2026 — at, henüz koşulmamış (`scheduled`/`locking`) bir lobi
 * yarışına kayıtlıyken satılamaz, pazara çıkarılamaz ve ikinci bir açık
 * yarışa yazılamaz. Aksi hâlde satılan at eski sahibi adına koşar ve ödülü
 * satıcı alırdı (katılım satırının `player_id`si satıcıdır) — bu hiçbir
 * yerde hata üretmezdi. Kilit yarış bitince/iptal edilince kendiliğinden
 * kalkar: kural durum-temellidir, ayrı bir "serbest bırak" adımı yoktur.
 */
export class HorseInActiveRaceError extends Error {
  readonly code = ErrorCode.HorseInActiveRace;

  constructor(public readonly horseId: string) {
    super(`At (${horseId}) henüz koşulmamış bir yarışa kayıtlı olduğu için bu işlem yapılamaz.`);
    this.name = 'HorseInActiveRaceError';
  }
}
