import { Inject, Injectable } from '@nestjs/common';
import type { FeedStatusView } from '@at-sevdalisi/shared-types';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { buildFeedItemView } from '../../domain/care/care';
import { FEED_TYPES } from '../../domain/care/validation';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { FEED_INVENTORY_REPOSITORY, type FeedInventoryRepository } from '../ports/feed-inventory.repository';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';

/**
 * `GET /horses/:id/feed-status` — bu turda EKLENDİ.
 *
 * BESLEME EKRANININ veri kaynağı: her kalem için stok + bu ATA özel günlük
 * kalan hak. İstemci "bugün kaç saman hakkım kaldı"yı KENDİSİ HESAPLAMAZ
 * (CLAUDE.md "SUNUCU OTORİTESİ") — kayan pencere sunucuda, `horse_feed_log`
 * üzerinden ölçülür ve `fedInWindow` olarak döner.
 *
 * Pencere `care.config.json` `feedWindowHours`'tan gelir; `FeedHorseUseCase`
 * ile AYNI pencere başlangıcı kullanılır (ikisi ayrışırsa ekranda "hakkın
 * var" yazıp sunucunun reddetmesi gibi bir tutarsızlık doğardı).
 *
 * SIRA: önce at okunur (yoksa 404), sonra o atın SAHİBİNİN envanteri okunur
 * — başka bir oyuncunun stoğu asla sızmaz.
 */
@Injectable()
export class GetHorseFeedStatusUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(FEED_INVENTORY_REPOSITORY) private readonly feedRepository: FeedInventoryRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(horseId: string): Promise<FeedStatusView> {
    const horse = await this.horseRepository.findById(horseId);
    if (horse === null) {
      throw new HorseNotFoundError(horseId);
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - this.config.care.feedWindowHours * 60 * 60 * 1000);
    const [quantities, usages] = await Promise.all([
      this.feedRepository.findQuantities(horse.ownerId),
      this.feedRepository.getWindowUsages(horseId, windowStart),
    ]);

    return {
      horseId,
      items: FEED_TYPES.map((type) =>
        buildFeedItemView(this.config.care, type, quantities.get(type) ?? 0, usages.get(type)?.fedInWindow ?? 0),
      ),
    };
  }
}
