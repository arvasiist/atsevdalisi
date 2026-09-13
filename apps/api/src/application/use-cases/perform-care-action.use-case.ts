import { Inject, Injectable } from '@nestjs/common';
import type { CareActionType, PerformCareActionResult } from '@at-sevdalisi/shared-types';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { applyCareAction } from '../../domain/care/care';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { CARE_LOG_REPOSITORY, type CareLogRepository } from '../ports/care-log.repository';
import { HORSE_HEALTH_REPOSITORY, type HorseHealthRepository } from '../ports/horse-health.repository';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';

/**
 * `POST /horses/{id}/care` (docs/API.md §4, brief §11).
 *
 * KAPSAM (bu dilim, bilinçli — bkz. docs/ROADMAP.md "FAZ 1 wiring —
 * Beşinci dilim: Bakım"):
 *  - docs/API.md'nin önceki taslağındaki AYRI `vet`/`farrier`/`rest`
 *    uç noktaları TEK bu uç noktaya (`actionType` alanıyla) BİRLEŞTİRİLDİ
 *    — `domain/care/care.ts`'in `applyCareAction`'ı zaten TÜM altı eylem
 *    türünü (`groom`/`water`/`clean`/`vet`/`farrier`/`rest`) TEK bir
 *    fonksiyonla ele alıyor; Antrenman dilimindeki "tek endpoint + type
 *    alanı" kararıyla AYNI gerekçe.
 *  - Bakımın bu dilimde bir PARA maliyeti YOKTUR (Economy entegrasyonu
 *    KAPSAM DIŞI — Antrenman dilimindeki "kapsam dışı" notuyla AYNI
 *    gerekçe; `getCareActionCost` zaten domain katmanında hazır).
 *  - `HorseHealth`'in yalnızca `CareableHealth` alt kümesi (injuryRisk/
 *    recoveryRate/jointCondition/weightCondition) güncellenir —
 *    `health`/`muscleCondition`/`respiratoryCondition`/`lastVetCheck`
 *    bu dilimde DOKUNULMAZ (bkz. `HorseHealthRepository` üstündeki not).
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 7'nin dersi burada BAŞTAN
 * uygulanır: `domain/care/care.ts` `actionType`'ı KENDİSİ de doğrular
 * (DTO'nun `@IsIn(...)`'ine TEK BAŞINA güvenilmez).
 */
@Injectable()
export class PerformCareActionUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(HORSE_HEALTH_REPOSITORY) private readonly horseHealthRepository: HorseHealthRepository,
    @Inject(CARE_LOG_REPOSITORY) private readonly careLogRepository: CareLogRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(horseId: string, actionType: CareActionType): Promise<PerformCareActionResult> {
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
    const lastPerformedAt = await this.careLogRepository.findLastPerformedAt(horseId, actionType);
    const vitals = {
      health: horse.health,
      fitness: horse.fitness,
      fatigue: horse.fatigue,
      energy: horse.energy,
      morale: horse.morale,
    };

    const result = applyCareAction(this.config.care, actionType, vitals, health, lastPerformedAt, now);

    await this.horseRepository.update({
      ...horse,
      health: result.vitals.health,
      fitness: result.vitals.fitness,
      fatigue: result.vitals.fatigue,
      energy: result.vitals.energy,
      morale: result.vitals.morale,
      updatedAt: now.toISOString(),
    });
    await this.horseHealthRepository.updateCareableFields(horseId, result.health);
    await this.careLogRepository.recordPerformed(horseId, actionType, now);

    return {
      horseId,
      actionType,
      newVitals: {
        health: result.vitals.health,
        fitness: result.vitals.fitness,
        fatigue: result.vitals.fatigue,
        energy: result.vitals.energy,
        morale: result.vitals.morale,
      },
      newHealth: result.health,
    };
  }
}
