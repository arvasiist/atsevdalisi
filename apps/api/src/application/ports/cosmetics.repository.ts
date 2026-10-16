import type { CosmeticItemConfig } from '@at-sevdalisi/game-config';

export const COSMETICS_REPOSITORY = Symbol('COSMETICS_REPOSITORY');

export interface CosmeticPurchaseOutcome {
  /** Satın alma sonrası elmas bakiyesi. */
  gems: number;
}

/**
 * 09.10.2026 — kozmetik sahipliği. Satın alma PARA YOLUDUR: oyuncu satırı
 * `FOR UPDATE` → sahiplik + bakiye kilit altında → bakiye + sahiplik +
 * `cosmetic_purchase` defter satırı TEK transaction.
 */
export interface CosmeticsRepository {
  listOwnedKeys(playerId: string): Promise<Set<string>>;
  findGems(playerId: string): Promise<number | null>;
  purchase(input: {
    playerId: string;
    item: CosmeticItemConfig;
    now: Date;
    idempotencyKey: string | null;
  }): Promise<CosmeticPurchaseOutcome>;
}
