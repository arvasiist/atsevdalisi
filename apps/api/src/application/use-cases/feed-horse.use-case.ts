import { Inject, Injectable } from '@nestjs/common';
import type { FeedHorseResult, Horse } from '@at-sevdalisi/shared-types';
import { HorseNotFoundError } from '../../domain/horse/errors';
import {
  applyFeed,
  assertFeedAllowance,
  assertFeedStockAvailable,
  getFeedDailyLimit,
  isFeedStocked,
} from '../../domain/care/care';
import { parseFeedType } from '../../domain/care/validation';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { FEED_INVENTORY_REPOSITORY, type FeedInventoryRepository } from '../ports/feed-inventory.repository';
import { HORSE_HEALTH_REPOSITORY, type HorseHealthRepository } from '../ports/horse-health.repository';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';

/**
 * `POST /horses/{id}/feed` (docs/API.md §4, brief §12).
 *
 * DEĞİŞTİ (bu turda) — besleme artık GERÇEK bir kaynak tüketir:
 *  - `saman` BEDAVADIR ama at başına günde 3 kez verilebilir
 *    (`care.config.json` `feedTypes.saman.dailyLimit`).
 *  - `arpa`/`mama`/`havuc`/`vitamin` ELMASLA satın alınır
 *    (`BuyFeedUseCase`) ve envanterden DÜŞER; stok yoksa besleme reddedilir.
 *
 * ÜÇ KONTROL DE SATIR KİLİTLİYKEN yapılır (`feedWithLock` callback'i İÇİNDE):
 * stok adedi, kayan penceredeki kullanım ve bakiye gibi değerler ancak o an
 * GÜNCELDİR — callback dışında okunan bir stok, iki eşzamanlı isteğin son
 * kalan samanı/arvayı iki kez vermesine yol açardı (bkz.
 * `FeedInventoryRepository` doc yorumu).
 *
 * DEĞİŞMEYEN KAPSAM: `applyFeed` hâlâ SAF (bkz. `domain/care/care.ts`) —
 * stok düşümü, sınır sayımı ve `horse_feed_log` kaydı repository'nin tek
 * transaction'ında olur. `horse_health` (CareableHealth) yazımı ise — bu
 * dilimde DEĞİŞMEDİ — kilidin DIŞINDA kalır (bkz. `PerformCareActionUseCase`
 * doc yorumundaki dürüstlük notu, aynı sınır burada da geçerli).
 */
@Injectable()
export class FeedHorseUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(HORSE_HEALTH_REPOSITORY) private readonly horseHealthRepository: HorseHealthRepository,
    @Inject(FEED_INVENTORY_REPOSITORY) private readonly feedRepository: FeedInventoryRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(horseId: string, rawFeedType: unknown): Promise<FeedHorseResult> {
    // DTO'nun `@IsIn(...)`'ine TEK BAŞINA güvenilmez (CLAUDE.md "Kardeş
    // tuzak") — `PerformCareActionUseCase` ile AYNI disiplin.
    const feedType = parseFeedType(rawFeedType);

    const horse = await this.horseRepository.findById(horseId);
    if (horse === null) {
      throw new HorseNotFoundError(horseId);
    }

    const health = await this.horseHealthRepository.findCareableHealth(horseId);
    if (health === null) {
      // Veri bütünlüğü varsayımı: her at, `save()` sırasında bir
      // `horse_health` satırıyla birlikte yaratılır (bkz.
      // `PostgresHorseRepository.save()`) — bu dala normal koşullarda
      // ULAŞILMAZ.
      throw new HorseNotFoundError(horseId);
    }

    const now = new Date();
    const { feedWindowHours } = this.config.care;
    const windowStart = new Date(now.getTime() - feedWindowHours * 60 * 60 * 1000);
    const dailyLimit = getFeedDailyLimit(this.config.care, feedType) ?? undefined;
    const stocked = isFeedStocked(this.config.care, feedType);

    // Sahiplik kontrolü `HorseOwnerGuardByParam` (controller) tarafından
    // yapılır; burada `horse.ownerId` yalnızca KİLİTLENECEK oyuncuyu belirler.
    const lockResult = await this.feedRepository.feedWithLock(
      horse.ownerId,
      horseId,
      feedType,
      windowStart,
      ({ horse: lockedHorse, quantity, usage }) => {
        assertFeedStockAvailable(this.config.care, feedType, quantity);
        const allowance = assertFeedAllowance(
          feedType,
          dailyLimit,
          usage.fedInWindow,
          usage.oldestInWindowAt,
          now,
          feedWindowHours,
        );

        const vitals = {
          health: lockedHorse.health,
          fitness: lockedHorse.fitness,
          fatigue: lockedHorse.fatigue,
          energy: lockedHorse.energy,
          morale: lockedHorse.morale,
        };

        const feedResult = applyFeed(this.config.care, feedType, vitals, health);

        const updatedHorse: Horse = {
          ...lockedHorse,
          health: feedResult.vitals.health,
          fitness: feedResult.vitals.fitness,
          fatigue: feedResult.vitals.fatigue,
          energy: feedResult.vitals.energy,
          morale: feedResult.vitals.morale,
          updatedAt: now.toISOString(),
        };

        // Stoklanmayan kalemde (`saman`) envantere HİÇ dokunulmaz —
        // `null` repository'ye "yazma" der (bkz. `FeedMutationResult`).
        const stockAfter = stocked ? quantity - 1 : null;

        const result: FeedHorseResult = {
          horseId,
          feedType,
          newVitals: {
            health: feedResult.vitals.health,
            fitness: feedResult.vitals.fitness,
            fatigue: feedResult.vitals.fatigue,
            energy: feedResult.vitals.energy,
            morale: feedResult.vitals.morale,
          },
          newHealth: feedResult.health,
          remainingToday: allowance.remainingToday,
          stockAfter,
        };

        return { horse: updatedHorse, quantity: stockAfter, result };
      },
    );

    if (lockResult === null) {
      throw new HorseNotFoundError(horseId);
    }

    await this.horseHealthRepository.updateCareableFields(horseId, lockResult.newHealth);

    return lockResult;
  }
}
