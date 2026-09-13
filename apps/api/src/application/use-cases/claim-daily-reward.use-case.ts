import { Inject, Injectable } from '@nestjs/common';
import type { ClaimDailyRewardResult, Player } from '@at-sevdalisi/shared-types';
import { assertCanClaimDailyReward } from '../../domain/economy/daily-reward';
import { credit } from '../../domain/economy/wallet';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';

/**
 * FAZ 1 wiring, yedinci dilim — brief §37 "GÜNLÜK OYUN DÖNGÜSÜ" (Login →
 * **Daily Reward** → Horse Status Check → ...); brief §31 gelir kalemleri
 * listesinde "Günlük ödül". `domain/economy/wallet.ts`'teki `credit`'in
 * İLK gerçek kullanımı (`debit`, Ahır Yükseltme dilimiyle zaten
 * bağlanmıştı).
 *
 * `PlayerRepository.updateWithLock` — Ahır Yükseltme'de kurulan AYNI satır
 * kilitleme deseni burada da kullanılır (bkz. docs/ARCHITECTURE.md §9.3):
 * iki eşzamanlı "günlük ödülü talep et" isteği aynı ödülü iki kez
 * kazandıramaz — `assertCanClaimDailyReward`, satır kilitliyken okunan
 * GÜNCEL `lastDailyRewardClaimedAt`'a göre çalışır.
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
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string): Promise<ClaimDailyRewardResult> {
    const result = await this.playerRepository.updateWithLock(playerId, (player) => {
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

      const claimResult: ClaimDailyRewardResult = {
        amount,
        currency: 'money',
        newBalance,
        nextClaimAvailableAt,
      };

      // AUDIT_AND_HARDENING Öncelik 2 (bu oturum) — para hareketi ledger'a
      // yazılır, oyuncu satırının güncellenmesiyle AYNI transaction'da
      // (bkz. `PlayerRepository.updateWithLock` doc yorumu).
      return {
        player: updated,
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
