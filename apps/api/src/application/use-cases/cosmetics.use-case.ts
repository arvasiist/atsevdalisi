import { Inject, Injectable } from '@nestjs/common';
import type { CosmeticItemView, CosmeticPurchaseResult, CosmeticsCatalogView } from '@at-sevdalisi/shared-types';
import { loadAvatarConfig, loadCosmeticsConfig, type CosmeticItemConfig } from '@at-sevdalisi/game-config';
import { cosmeticColor, findCosmetic } from '../../domain/cosmetics/cosmetics';
import { CosmeticNotFoundError } from '../../domain/cosmetics/errors';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { COSMETICS_REPOSITORY, type CosmeticsRepository } from '../ports/cosmetics.repository';

const cosmetics = loadCosmeticsConfig();
const avatar = loadAvatarConfig();

/**
 * KOZMETİK MAĞAZA (09.10.2026, elmas politikası). Ürünü ve fiyatı istemci
 * değil config belirler; istemci yalnızca ürün ANAHTARINI gönderir.
 */
@Injectable()
export class CosmeticsUseCase {
  constructor(@Inject(COSMETICS_REPOSITORY) private readonly repository: CosmeticsRepository) {}

  async catalog(playerId: string): Promise<CosmeticsCatalogView> {
    const [owned, gems] = await Promise.all([this.repository.listOwnedKeys(playerId), this.repository.findGems(playerId)]);
    if (gems === null) {
      throw new PlayerNotFoundError(playerId);
    }
    return { gems, items: cosmetics.items.map((item) => toView(item, owned.has(item.key))) };
  }

  async purchase(playerId: string, rawKey: unknown, idempotencyKey: string | null): Promise<CosmeticPurchaseResult> {
    const item = findCosmetic(cosmetics, rawKey);
    if (item === null) {
      throw new CosmeticNotFoundError(typeof rawKey === 'string' ? rawKey.slice(0, 40) : String(rawKey));
    }
    const outcome = await this.repository.purchase({ playerId, item, now: new Date(), idempotencyKey });
    return { item: toView(item, true), gems: outcome.gems };
  }

  /** Avatar kaydı için: oyuncunun sahip olduğu ürün anahtarları. */
  ownedKeys(playerId: string): Promise<Set<string>> {
    return this.repository.listOwnedKeys(playerId);
  }
}

function toView(item: CosmeticItemConfig, owned: boolean): CosmeticItemView {
  return {
    key: item.key,
    name: item.name,
    catalog: item.catalog,
    optionId: item.optionId,
    color: cosmeticColor(item, avatar),
    priceGems: item.priceGems,
    owned,
  };
}
