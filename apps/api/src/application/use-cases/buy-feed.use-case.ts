import { Inject, Injectable } from '@nestjs/common';
import type { BuyFeedResult, Player } from '@at-sevdalisi/shared-types';
import { debit } from '../../domain/economy/wallet';
import { getFeedPrice, isFeedStocked } from '../../domain/care/care';
import { FeedNotPurchasableError, InvalidFeedPurchaseCountError } from '../../domain/care/errors';
import { parseFeedType } from '../../domain/care/validation';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { FEED_INVENTORY_REPOSITORY, type FeedInventoryRepository } from '../ports/feed-inventory.repository';

/**
 * `POST /players/:id/feed-inventory/:type/buy` — bu turda EKLENDİ.
 *
 * MODEL: yem SATIN ALINIR (elmasla) → envantere girer → beslemede stoktan
 * düşer (`FeedHorseUseCase`). Besleme anında para HARCANMAZ; tek para
 * hareketi BURADADIR. Bu ayrım bilinçlidir: kullanıcı "besleyici mama
 * elmasla alınsın" dedi — yani elmas bir KALEM karşılığında harcanır, bir
 * eylem karşılığında değil.
 *
 * PARA YOLU (CLAUDE.md "PARA/MUTASYON YOLU"): bakiye düşümü `debit` ile
 * hesaplanır ama gerçek yazma `buyWithLock`'un transaction'ı içindedir —
 * `players` satırı `SELECT ... FOR UPDATE` ile kilitliyken okunur, bakiye +
 * stok + `economy_transactions` defter kaydı AYNI transaction'da yazılır
 * (`UpgradeFacilityUseCase` ile AYNI desen).
 *
 * Hesaplama BİLEREK `mutate` callback'inin İÇİNDE yapılır: satır kilitliyken
 * okunan `player`/`currentQuantity` en güncel değerdir; dışarıda okunan bir
 * bakiye STALE olabilir ve çift harcamaya kapı bırakır.
 *
 * ELMAS KAYNAĞI (KAPSAM NOTU — dürüstlük): elmas KAZANDIRAN yollar
 * (ödüllü reklam izleme, kişi kartıyla satın alma) bu dilimde YOKTUR. İkisi
 * de harici bir servise (reklam ağı SSV doğrulaması / ödeme sağlayıcısı)
 * bağlıdır ve doğrulamasız bir "elmas ver" uç noktası yazmak sunucu
 * otoritesini kırardı (istemci istediği kadar elmas isteyebilirdi). Bu
 * uçlar, mevcut fail-closed kimlik deseniyle (bkz.
 * `GoogleAppleIdentityProvider`) ve sağlayıcı kimlik bilgileri geldiğinde
 * eklenecektir.
 */
@Injectable()
export class BuyFeedUseCase {
  constructor(
    @Inject(FEED_INVENTORY_REPOSITORY) private readonly feedRepository: FeedInventoryRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string, rawFeedType: unknown, rawCount: unknown): Promise<BuyFeedResult> {
    const feedType = parseFeedType(rawFeedType);
    const count = this.parseCount(rawCount);

    const price = getFeedPrice(this.config.care, feedType);
    // Fiyatı olmayan (veya stoklanmayan) kalem satın ALINAMAZ — `saman`
    // zaten bedavadır ve günlük sınırla korunur, satın alma stoğu olmaz.
    if (price === undefined || !isFeedStocked(this.config.care, feedType)) {
      throw new FeedNotPurchasableError(feedType);
    }

    const total = price.amount * count;

    const result = await this.feedRepository.buyWithLock(
      playerId,
      feedType,
      count,
      (player, currentQuantity) => {
        // Yetersiz bakiye (`InsufficientFundsError`) BURADA fırlatılırsa
        // transaction ROLLBACK olur — ne para düşer ne stok yazılır.
        const newBalance = debit({ money: player.money, gems: player.gems }, total, price.currency);

        const quantity = currentQuantity + count;
        const updated: Player = {
          ...player,
          money: newBalance.money,
          gems: newBalance.gems,
          updatedAt: new Date().toISOString(),
        };

        const buyResult: BuyFeedResult = {
          type: feedType,
          quantity,
          newBalance,
          price: { currency: price.currency, amount: price.amount },
          purchasedCount: count,
        };

        return {
          player: updated,
          quantity,
          result: buyResult,
          ledgerEntries: [
            {
              playerId,
              type: 'feed_purchase',
              amount: -total,
              currency: price.currency,
              referenceType: 'feed_item',
              // Envanter satırının kendi kimliği yoktur (PK: oyuncu+kalem),
              // bu yüzden referans olarak kalem adı kullanılır.
              referenceId: feedType,
              balanceBefore: player[price.currency],
              balanceAfter: newBalance[price.currency],
              idempotencyKey: null,
            },
          ],
        };
      },
    );

    if (result === null) {
      throw new PlayerNotFoundError(playerId);
    }

    return result;
  }

  /**
   * Gövdedeki `count`'u doğrular. Gövde eksikse (`undefined`) `1` kabul
   * edilir — "bir adet al" en yaygın kullanımdır ve istemciyi gereksiz bir
   * alan doldurmaya zorlamaz. Diğer HER durumda pozitif bir TAMSAYI şarttır
   * (ondalık/negatif/sıfır/aşırı büyük değer reddedilir).
   */
  private parseCount(value: unknown): number {
    if (value === undefined || value === null) {
      return 1;
    }
    const { feedPurchaseMaxCount } = this.config.care;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > feedPurchaseMaxCount) {
      throw new InvalidFeedPurchaseCountError(value, feedPurchaseMaxCount);
    }
    return value;
  }
}
