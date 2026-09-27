import { Inject, Injectable } from '@nestjs/common';
import type { GiftView } from '@at-sevdalisi/shared-types';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { GIFT_REPOSITORY, type GiftRepository } from '../ports/gift.repository';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';

/**
 * Oyuncunun hediyeleri (gelen + giden, tek listede). `GET /players/:id/gifts`.
 *
 * `GetSocialOverviewUseCase` ile AYNI desen: iş kuralı İÇERMEZ, oyuncunun
 * var olduğunu doğrular (yoksa 404 — sessizce boş liste dönmez) ve
 * repository'yi çağırır. **Tek işi** `Date` alanlarını ISO metne çevirmek
 * ve `direction`'ı (repository'de `sender_id`'den türetilmiş) olduğu gibi
 * API sınırına taşımaktır.
 *
 * **NEDEN "gelen kutusu" + "giden kutusu" AYRI uç noktalar DEĞİL:** hediye
 * geçmişi tek bir akıştır — kullanıcı "ona ne gönderdim, ondan ne aldım"
 * sorusunu tek ekranda sorar (`GetInboxUseCase`'in mesajlarda İKİ uç nokta
 * kullanması farklı bir gerekçedir: orada okundu işaretleme YAN ETKİSİ
 * vardır ve onu yalnızca gelen kutusuna uygulamak gerekir).
 *
 * `limit` config'ten gelir (`config/gift.config.json → historyLimit`) —
 * CLAUDE.md "SİHİRLİ SAYI YOK".
 */
@Injectable()
export class ListMyGiftsUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(GIFT_REPOSITORY) private readonly giftRepository: GiftRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string): Promise<GiftView[]> {
    const player = await this.playerRepository.findById(playerId);
    if (player === null) {
      throw new PlayerNotFoundError(playerId);
    }

    const rows = await this.giftRepository.listGifts(playerId, this.config.gift.historyLimit);

    return rows.map((row) => ({
      giftId: row.giftId,
      direction: row.direction,
      counterparty: {
        playerId: row.counterparty.playerId,
        displayName: row.counterparty.displayName,
        level: row.counterparty.level,
      },
      currency: row.currency,
      amount: row.amount,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
