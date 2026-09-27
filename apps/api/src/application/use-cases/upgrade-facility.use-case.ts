import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { FacilityType, FacilityUpgradeResult, Player } from '@at-sevdalisi/shared-types';
import { debit } from '../../domain/economy/wallet';
import { buildFacility, summarizeFacility, upgradeFacility } from '../../domain/farm/farm';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { FACILITY_REPOSITORY, type FacilityRepository } from '../ports/facility.repository';

/**
 * brief §32 "Çiftlik" — `POST /players/:id/farm/facilities/:type/upgrade`.
 * Bu turda EKLENDİ. `UpgradeStableUseCase`'in (ahır yükseltme) ÇİFTLİK
 * karşılığıdır ve onunla AYNI deseni izler.
 *
 * PARA YOLU (CLAUDE.md "PARA/MUTASYON YOLU"): bakiye düşümü `debit` ile
 * yapılır, ama gerçek yazma `FacilityRepository.upgradeWithLock`'un
 * transaction'ı içindedir — `SELECT ... FOR UPDATE` ile oyuncu satırı
 * kilitliyken okunur, `economy_transactions`'a defter kaydı AYNI
 * transaction'da yazılır, üçü (bakiye + tesis satırı + defter) birlikte
 * commit edilir ya da birlikte geri alınır.
 *
 * Hesaplama BİLEREK `mutate` callback'inin İÇİNDE yapılır: satır kilitliyken
 * okunan `player` en güncel/authoritative değerdir; dışarıda (önce ayrı bir
 * `findById` ile) okunan bir bakiye STALE olabilir ve çift harcamaya kapı
 * bırakır (bkz. `PlayerRepository.updateWithLock` doc yorumu).
 *
 * İLK İNŞA İLE YÜKSELTME AYNI UÇ NOKTADIR: `facility === null` ise tesis
 * `level 0 → 1` inşa edilir (`buildFacility`), aksi halde bir üst seviyeye
 * çıkarılır (`upgradeFacility`). İkisi de aynı maliyet fonksiyonundan
 * (`getNextFacilityUpgradeCost`) geçer — bu yüzden ayrı bir "inşa et" ucu
 * YOKTUR ve iki yolun kuralları birbirinden ayrışamaz.
 */
@Injectable()
export class UpgradeFacilityUseCase {
  constructor(
    @Inject(FACILITY_REPOSITORY) private readonly facilityRepository: FacilityRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(ownerId: string, type: FacilityType): Promise<FacilityUpgradeResult> {
    const result = await this.facilityRepository.upgradeWithLock(ownerId, type, (player, facility) => {
      // Domain hatası (`MaxFacilityLevelReachedError`) ve yetersiz bakiye
      // (`InsufficientFundsError`) BURADA fırlatılırsa transaction ROLLBACK
      // olur — ne para düşer ne tesis yazılır.
      const isFirstBuild = facility === null;
      const { facility: updatedFacility, cost } = isFirstBuild
        ? buildFacility({ id: randomUUID(), ownerId, type }, this.config.farm)
        : upgradeFacility(facility, this.config.farm);

      const newBalance = debit({ money: player.money, gems: player.gems }, cost.amount, cost.currency);

      const updated: Player = {
        ...player,
        money: newBalance.money,
        gems: newBalance.gems,
        updatedAt: new Date().toISOString(),
      };

      const upgradeResult: FacilityUpgradeResult = {
        facility: summarizeFacility(updatedFacility.type, updatedFacility.level, this.config.farm),
        newBalance,
        cost: { currency: cost.currency, amount: cost.amount },
      };

      return {
        player: updated,
        facility: updatedFacility,
        result: upgradeResult,
        // `UpgradeStableUseCase` ile AYNI desen: önceki/sonraki bakiye
        // `cost.currency`'e göre İLGİLİ para biriminden okunur (tesis
        // maliyeti `farm.config.json`'da şu an hep `money`, ama tip ikisini
        // de kabul eder — koda gömülü bir varsayım bırakılmaz).
        // `type` alanı serbest metindir, yeni bir tür migration GEREKTİRMEZ
        // (bkz. `ports/economy-ledger.ts`).
        ledgerEntries: [
          {
            playerId: ownerId,
            type: isFirstBuild ? 'facility_build' : 'facility_upgrade',
            amount: -cost.amount,
            currency: cost.currency,
            referenceType: 'facility',
            referenceId: updatedFacility.id,
            balanceBefore: player[cost.currency],
            balanceAfter: newBalance[cost.currency],
            idempotencyKey: null,
          },
        ],
      };
    });

    if (result === null) {
      throw new PlayerNotFoundError(ownerId);
    }

    return result;
  }
}
