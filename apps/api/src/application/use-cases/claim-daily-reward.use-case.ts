import { Inject, Injectable } from '@nestjs/common';
import type { ClaimDailyRewardResult, Player } from '@at-sevdalisi/shared-types';
import { assertCanClaimDailyReward } from '../../domain/economy/daily-reward';
import { credit } from '../../domain/economy/wallet';
import { assertDailyGiftItemsAreStocked, getDailyGiftItems } from '../../domain/care/care';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { FEED_INVENTORY_REPOSITORY, type FeedInventoryRepository } from '../ports/feed-inventory.repository';

/**
 * FAZ 1 wiring, yedinci dilim — brief §37 "GÜNLÜK OYUN DÖNGÜSÜ" (Login →
 * **Daily Reward** → Horse Status Check → ...); brief §31 gelir kalemleri
 * listesinde "Günlük ödül". `domain/economy/wallet.ts`'teki `credit`'in
 * İLK gerçek kullanımı (`debit`, Ahır Yükseltme dilimiyle zaten
 * bağlanmıştı).
 *
 * DEĞİŞTİ (bu turda) — günlük ödül artık para ile BİRLİKTE BEDAVA YEM de
 * verir (`care.config.json` `feedDailyGift`: şu an 2 arpa + 1 havuç). Bu
 * yüzden kilit/yazma `PlayerRepository.updateWithLock`'tan
 * `FeedInventoryRepository.grantWithLock`'a TAŞINDI: `updateWithLock`'un
 * callback'i yalnızca `players` satırını yazabildiğinden
 * `player_feed_inventory`'ye dokunamaz, iki ayrı transaction'a bölmek ise
 * "para verildi ama yem verilmedi" durumunu mümkün kılardı. Kilit, kilitleme
 * disiplini ve "kontrol callback İÇİNDE yapılır" kuralı AYNEN korunmuştur:
 * iki eşzamanlı "günlük ödülü talep et" isteği aynı ödülü iki kez
 * kazandıramaz.
 *
 * Kapsam dışı (bilinçli): brief §54'ün tam `Idempotency-Key` + Redis
 * "aynı yanıtı tekrar döndürme" altyapısı — bu eylem zaten kendi cooldown
 * kontrolüyle çifte ödüle karşı FİNANSAL olarak korumalıdır (bir tekrar
 * isteği para vermez, yalnızca `DAILY_REWARD_ALREADY_CLAIMED` döner);
 * eksik olan yalnızca "orijinal başarı yanıtını AYNEN tekrar döndürme" UX
 * garantisidir — Redis'in zaten gerekli olacağı Race/Market gibi daha
 * büyük bir dilime bırakılmıştır (bkz. `domain/economy/daily-reward.ts`
 * altındaki KAPSAM notu). Takvim günü bazlı reset ve streak bonusu da
 * KAPSAM DIŞIDIR.
 */
@Injectable()
export class ClaimDailyRewardUseCase {
  constructor(
    @Inject(FEED_INVENTORY_REPOSITORY) private readonly feedRepository: FeedInventoryRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string): Promise<ClaimDailyRewardResult> {
    // Config tutarlılığı (hediye yalnızca STOKLANAN kalemleri içerebilir)
    // kilitten ÖNCE doğrulanır — yanlış düzenlenmiş bir config, sessizce
    // "hediye verildi ama hiçbir şey eklenmedi" durumuna düşmesin
    // (bkz. `assertDailyGiftItemsAreStocked` doc yorumu).
    assertDailyGiftItemsAreStocked(this.config.care);
    const giftItems = getDailyGiftItems(this.config.care);

    const result = await this.feedRepository.grantWithLock(playerId, (player, quantities) => {
      const now = new Date();
      // BİLEREK satır kilitliyken (callback İÇİNDE) kontrol edilir — bkz.
      // `PlayerRepository.updateWithLock` doc yorumundaki "stale değer"
      // uyarısı, Ahır Yükseltme'deki AYNI gerekçe.
      const lastClaimedAt = player.lastDailyRewardClaimedAt ? new Date(player.lastDailyRewardClaimedAt) : null;
      assertCanClaimDailyReward(lastClaimedAt, now, this.config.economy.dailyRewardCooldownHours);

      const amount = this.config.economy.dailyRewardMoney;
      const newBalance = credit({ money: player.money, gems: player.gems }, amount, 'money');

      const updated: Player = {
        ...player,
        money: newBalance.money,
        lastDailyRewardClaimedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      const nextClaimAvailableAt = new Date(
        now.getTime() + this.config.economy.dailyRewardCooldownHours * 60 * 60 * 1000,
      ).toISOString();

      // Hediye edilen yem: kilitliyken okunan GÜNCEL stoğun ÜSTÜNE eklenir
      // (`quantityAfter` mutlak değerdir — bkz. `FeedGrant`).
      const grantedFeed = giftItems.map(({ type, count }) => ({
        type,
        count,
        quantityAfter: (quantities.get(type) ?? 0) + count,
      }));

      const claimResult: ClaimDailyRewardResult = {
        amount,
        currency: 'money',
        newBalance,
        nextClaimAvailableAt,
        grantedFeed,
      };

      // AUDIT_AND_HARDENING Öncelik 2 (bu oturum) — para hareketi ledger'a
      // yazılır, oyuncu satırının güncellenmesiyle AYNI transaction'da
      // (bkz. `PlayerRepository.updateWithLock` doc yorumu).
      return {
        player: updated,
        grants: grantedFeed.map((item) => ({ type: item.type, quantity: item.quantityAfter })),
        result: claimResult,
        ledgerEntries: [
          {
            playerId,
            type: 'daily_reward',
            amount,
            currency: 'money',
            referenceType: null,
            referenceId: null,
            balanceBefore: player.money,
            balanceAfter: newBalance.money,
            idempotencyKey: null,
          },
        ],
      };
    });

    if (result === null) {
      throw new PlayerNotFoundError(playerId);
    }

    return result;
  }
}
