import type { AnomalyRule } from '@at-sevdalisi/shared-types';

export const ANOMALY_REPOSITORY = Symbol('ANOMALY_REPOSITORY');

export interface RawAnomalyFinding {
  rule: AnomalyRule;
  subjectId: string;
  counterpartIds: string[];
  count: number;
  totalMoney: number;
  totalGems: number;
  firstAt: Date;
  lastAt: Date;
}

export interface AnomalyQuery {
  since: Date;
  newAccountDays: number;
  minDistinctNewSenders: number;
  minPairTrades: number;
  minOutflowMoney: number;
  limit: number;
}

export interface AnomalyRepository {
  findAnomalies(query: AnomalyQuery): Promise<RawAnomalyFinding[]>;
  findPlayers(ids: string[]): Promise<Array<{ id: string; username: string; createdAt: Date }>>;
}
