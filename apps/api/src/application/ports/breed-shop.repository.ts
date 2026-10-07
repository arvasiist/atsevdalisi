import type { BreedDefinitionConfig } from '@at-sevdalisi/game-config';
import type { Horse } from '@at-sevdalisi/shared-types';
import type { BreedInitialStats } from '../../domain/horse/breeds';

export interface BreedHorsePurchaseInput {
  playerId: string;
  breed: BreedDefinitionConfig;
  /** Fabrikadan çıkmış yeni at (sahibi `playerId`). */
  horse: Horse;
  initial: BreedInitialStats;
  idempotencyKey: string | null;
}

/**
 * Irk mağazası — PARA YOLU (07.10.2026). Tek transaction: oyuncu `FOR
 * UPDATE` → seviye kapısı + ahır kapasitesi + bakiye KİLİT ALTINDA → at ve
 * eşlik eden satırlar → bakiye → `breed_horse_purchase` defter satırı.
 */
export interface BreedShopRepository {
  purchase(input: BreedHorsePurchaseInput): Promise<{ money: number }>;
}

export const BREED_SHOP_REPOSITORY = Symbol('BREED_SHOP_REPOSITORY');
