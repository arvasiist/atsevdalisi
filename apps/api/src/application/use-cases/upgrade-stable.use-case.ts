import { Inject, Injectable } from '@nestjs/common';
import type { Player, StableUpgradeResult } from '@at-sevdalisi/shared-types';
import { getNextStableUpgradeCost, getStableCapacity } from '../../domain/stable/stable';
import { debit } from '../../domain/economy/wallet';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';

/**
 * FAZ 1 wiring, altıncı dilim — brief §32 "Ahır yükseltme" ve
 * docs/API.md'nin önceki taslağındaki `POST .../stable/upgrade`. Ahır
 * Özeti dilimi bunu bilinçli olarak KAPSAM DIŞI bırakmıştı ("gerçek para
 * düşme akışı Economy'nin debit fonksiyonu ile birlikte ayrı bir wiring
 * dilimini hak eder") — bu, tam olarak o dilimdir.
 *
 * `domain/stable/stable.ts`'teki `getNextStableUpgradeCost` (FAZ 0'dan
 * beri hazır) ile `domain/economy/wallet.ts`'teki `debit` (FAZ 0'dan beri
 * hazır, bu ana kadar HİÇ wiring edilmemişti) birleştirilir. Bu, projenin
 * PARA/mülkiyet değiştiren İLK use-case'idir — bu yüzden
 * docs/SECURITY.md §5'in satır kilitleme kuralı burada İLK KEZ gerçekten
 * uygulanır (bkz. `PlayerRepository.updateWithLock` doc yorumu).
 *
 * Kapsam dışı (bilinçli): yükseltmenin bir onay/geri alma akışı,
 * yükseltme geçmişi kaydı (`GET .../history` ile AYNI gerekçeyle KAPSAM
 * DIŞI).
 *
 * FAZ 1 wiring, onuncu dilim — bu use-case'in KENDİSİ değişmedi (para
 * mantığı burada zaten AYNI); yalnızca `StableController`'a
 * `IdempotencyInterceptor` eklendi. Dokuzuncu dilimde bilinçli olarak
 * açık bırakılan tek güvenlik eksiği (bkz. docs/API.md, docs/ROADMAP.md)
 * bu şekilde kapatıldı.
 */
@Injectable()
export class UpgradeStableUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string): Promise<StableUpgradeResult> {
    const result = await this.playerRepository.updateWithLock(playerId, (player) => {
      // BİLEREK satır kilitliyken (callback İÇİNDE) hesaplanır — bkz.
      // `PlayerRepository.updateWithLock` doc yorumundaki "stale değer"
      // uyarısı. `getNextStableUpgradeCost` tanımsız bir sonraki seviye
      // için `MaxStableLevelReachedError`, `debit` yetersiz bakiyede
      // `InsufficientFundsError` fırlatır — ikisi de burada fırlatılırsa
      // transaction ROLLBACK olur (hiçbir şey yazılmaz).
      const cost = getNextStableUpgradeCost(player.stableLevel, this.config.stable);
      const newBalance = debit({ money: player.money, gems: player.gems }, cost.amount, cost.currency);

      const updated: Player = {
        ...player,
        money: newBalance.money,
        gems: newBalance.gems,
        stableLevel: cost.nextLevel,
        updatedAt: new Date().toISOString(),
      };

      const upgradeResult: StableUpgradeResult = {
        newStableLevel: cost.nextLevel,
        newCapacity: getStableCapacity(cost.nextLevel, this.config.stable),
        newBalance,
        cost: { currency: cost.currency, amount: cost.amount },
      };

      return { player: updated, result: upgradeResult };
    });

    if (result === null) {
      throw new PlayerNotFoundError(playerId);
    }

    return result;
  }
}
