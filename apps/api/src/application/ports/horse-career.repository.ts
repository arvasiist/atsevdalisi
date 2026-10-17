import type { HorseCareerView, HorseRecordSummary } from '@at-sevdalisi/shared-types';

/**
 * 16.10.2026 — atın yarış + yetiştirme geçmişi (brief §3 "detaylı at profili",
 * §6 "ataların başarıları"). SAYAÇ TUTULMAZ: `race_entries`, defterdeki ödül
 * satırları ve `breeding_pairs` okunarak türetilir — ikinci bir istatistik
 * tablosu olsaydı defterle ayrışabilirdi.
 */
export interface HorseCareerRepository {
  /** At yoksa `null`. */
  findCareer(horseId: string, recentLimit: number): Promise<HorseCareerView | null>;
  /** Verilen atların özetleri; bulunmayan kimlik sonuçta YOKTUR. */
  findRecordsByHorseIds(horseIds: readonly string[]): Promise<Map<string, HorseRecordSummary>>;
}

export const HORSE_CAREER_REPOSITORY = Symbol('HORSE_CAREER_REPOSITORY');
