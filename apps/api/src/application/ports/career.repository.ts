export const CAREER_REPOSITORY = Symbol('CAREER_REPOSITORY');

export interface CareerHistoryRow {
  raceId: string;
  raceName: string;
  startTime: Date;
  trackId: string | null;
  classKey: string;
  finishPosition: number;
  fieldSize: number;
  points: number;
}

/** 16.10.2026 (brief §10) — kariyer puanı ve geçmişi (türetilir; yazma yok). */
export interface CareerRepository {
  pointsOf(playerId: string): Promise<number>;
  historyOf(playerId: string, limit: number): Promise<CareerHistoryRow[]>;
}
