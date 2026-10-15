import { ErrorCode } from '@at-sevdalisi/shared-types';
import type { HorseStatus } from '@at-sevdalisi/shared-types';

/**
 * EMEKLİLİK (15.10.2026, S5 — `docs/OYUN_DONGUSU_DENETIMI.md` B7). Sahibinin
 * kararı: damızlık için atın önce yarıştan emekli edilmesi ŞARTTIR. Emeklilik
 * atın ikinci kariyeridir (Photo Finish / ZED Champions deseni): emekli at
 * yarışamaz, antrenman yapamaz, yalnızca damızlık yapar. GERİ ALINMAZ —
 * veritabanı da `horses_retired_at_requires_status` ile korur (migration 0084).
 */

/** Zaten emekli at ikinci kez emekli edilemez (409). */
export class HorseAlreadyRetiredError extends Error {
  readonly code = ErrorCode.HorseAlreadyRetired;

  constructor(public readonly horseId: string) {
    super('Bu at zaten emekli.');
    this.name = 'HorseAlreadyRetiredError';
  }
}

/**
 * Oyuncu yarışabilecek SON atını emekli edemez (409). Emeklilik geri
 * alınmadığı için tek atını emekli eden yeni oyuncu, damızlık ücretini de
 * ödeyemiyorsa gelir kaynağı olmadan kalırdı.
 */
export class LastRacingHorseError extends Error {
  readonly code = ErrorCode.LastRacingHorse;

  constructor(public readonly horseId: string) {
    super('Yarışabilecek son atını emekli edemezsin; önce ahırına başka bir at al.');
    this.name = 'LastRacingHorseError';
  }
}

export interface RetirementCheckInput {
  horseId: string;
  status: HorseStatus;
  /** Aynı sahibin bu at DIŞINDAKİ emekli olmayan at sayısı (kilit altında sayılır). */
  otherNonRetiredHorseCount: number;
}

/** Saf kural — pazar ilanı ve açık yarış engelleri çağıranın kilidinde ayrıca denetlenir. */
export function assertCanRetire(input: RetirementCheckInput): void {
  if (input.status === 'retired') {
    throw new HorseAlreadyRetiredError(input.horseId);
  }
  if (input.otherNonRetiredHorseCount < 1) {
    throw new LastRacingHorseError(input.horseId);
  }
}
