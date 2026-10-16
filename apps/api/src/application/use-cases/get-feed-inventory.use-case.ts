import { Inject, Injectable } from '@nestjs/common';
import type { FeedInventoryView } from '@at-sevdalisi/shared-types';
import { buildFeedItemView } from '../../domain/care/care';
import { FarmEffectsService } from './farm-effects.service';
import { FEED_TYPES } from '../../domain/care/validation';
import { AppConfigService } from '../../infrastructure/config/config.service';
import {
  FEED_INVENTORY_REPOSITORY,
  type FeedInventoryRepository,
} from '../ports/feed-inventory.repository';

/**
 * `GET /players/:id/feed-inventory` — bu turda EKLENDİ.
 *
 * Yem dükkânının TEK veri kaynağı: kalem kataloğu (fiyat, günlük sınır,
 * stoklanıp stoklanmadığı) + oyuncunun elindeki adet. Fiyatlar/sınırlar
 * SUNUCUDAN gelir; istemci `config/*.config.json`'u BİLMEZ (CLAUDE.md
 * "SUNUCU OTORİTESİ" — istemciye config gönderilmez, yalnızca sonuç).
 *
 * Kalemler `FEED_TYPES` sırasıyla döner (ekran sırası: bedava kalem önce,
 * sonra artan fiyat) — DB sırasına GÜVENİLMEZ.
 *
 * NOT: oyuncunun VARLIĞI burada doğrulanmaz. Envanter okuması düz bir
 * `SELECT`tir ve hiç satır dönmemesi "hiç yem almamış oyuncu" ile "olmayan
 * oyuncu"yu ayırt etmez; ikisinde de boş envanter dönmek zararsızdır
 * (hiçbir para/veri değişmez). Yazma yolları (`buyWithLock`) ise oyuncuyu
 * kilitlerken zaten `PlayerNotFoundError` fırlatır.
 */
@Injectable()
export class GetFeedInventoryUseCase {
  constructor(
    @Inject(FEED_INVENTORY_REPOSITORY) private readonly feedRepository: FeedInventoryRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(FarmEffectsService) private readonly farmEffects: FarmEffectsService,
  ) {}

  async execute(playerId: string): Promise<FeedInventoryView> {
    const [quantities, effects] = await Promise.all([
      this.feedRepository.findQuantities(playerId),
      this.farmEffects.effectsFor(playerId),
    ]);

    return {
      playerId,
      items: FEED_TYPES.map((type) =>
        buildFeedItemView(
          this.config.care,
          type,
          quantities.get(type) ?? 0,
          null,
          effects.feedCostMultiplier,
        ),
      ),
    };
  }
}
