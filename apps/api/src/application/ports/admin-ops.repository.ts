import type {
  AdminHorseView,
  AdminSeasonView,
  AdminTournamentView,
  BalanceAdjustmentResult,
} from '@at-sevdalisi/shared-types';

export const ADMIN_OPS_REPOSITORY = Symbol('ADMIN_OPS_REPOSITORY');

export interface BalanceAdjustmentInput {
  actorId: string;
  playerId: string;
  currency: 'money' | 'gems';
  amount: number;
  reason: string;
  idempotencyKey: string | null;
}

export interface AdminOpsRepository {
  /**
   * PARA YOLU: oyuncu `FOR UPDATE` → bakiye → denetim kaydı → defter satırı
   * (referansı denetim kaydı) AYNI transaction'da. Oyuncu yoksa/silinmişse
   * `null`. Bakiye yetmezse `InsufficientFundsError` fırlatır (geri alınır).
   */
  adjustBalance(input: BalanceAdjustmentInput): Promise<BalanceAdjustmentResult | null>;
  searchHorses(query: string, limit: number): Promise<AdminHorseView[]>;
  listSeasons(limit: number, now: Date): Promise<AdminSeasonView[]>;
  listTournaments(limit: number): Promise<AdminTournamentView[]>;
}
