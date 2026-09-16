import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  Horse,
  HorseStatField,
  NumericHorseStatField,
  TrainHorseResult,
  TrainingIntensity,
  TrainingType,
} from '@at-sevdalisi/shared-types';
import { calculateAgeInMonths } from '../../domain/horse/age-curve';
import { HorseInjuredError, HorseNotFoundError } from '../../domain/horse/errors';
import { applyVitalDelta } from '../../domain/horse/vital-signs';
import { applyTraining, getPrimaryStatKey, rollInjuryOccurred } from '../../domain/training/training';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { HORSE_STATS_REPOSITORY, type HorseStatsRepository } from '../ports/horse-stats.repository';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';
import { TRAINING_SESSION_REPOSITORY, type TrainingSessionRepository } from '../ports/training-session.repository';

export interface TrainHorseInput {
  type: TrainingType;
  intensity: TrainingIntensity;
  durationMinutes: number;
}

/**
 * `POST /horses/{id}/train` (docs/API.md §4, brief §10, §75 MVP kriteri
 * "Antrenman stat/fatigue etkisi oluşturuyor").
 *
 * KAPSAM (bu dilim, bilinçli — bkz. docs/ROADMAP.md "FAZ 1 wiring —
 * Dördüncü dilim: Antrenman"):
 *  - Yalnızca `getPrimaryStatKey`'in eşlediği TEK bir stat güncellenir;
 *    brief'in örneklediği ikincil/sinerji stat etkileri KAPSAM DIŞI.
 *  - `applyTraining`'in döndürdüğü `TrainingOutcome` yalnızca statGain/
 *    fatigueGain/injuryRisk içerir — `energy`/`morale` bu saf domain
 *    fonksiyonlarında HENÜZ modellenmemiştir, bu yüzden bu antrenmanla
 *    DEĞİŞMEZLER (yanıtta mevcut değerleriyle döner). Domain algoritmaları
 *    ileride genişletilirse buraya OTOMATİK yansıyacaktır — bu use-case
 *    zaten `TrainingOutcome`'ın TÜM alanlarını kullanır.
 *  - Antrenmanın bu dilimde bir PARA maliyeti YOKTUR (Economy entegrasyonu
 *    KAPSAM DIŞI — brief §75 MVP kriteri yalnızca stat/fatigue etkisi
 *    ister, maliyet şartı koşmaz; `Stable Özeti` dilimindeki "kapsam dışı"
 *    notuyla AYNI gerekçe).
 *  - Sakatlık oluşursa at `status: 'injured'`'a geçer — brief'te
 *    büyüklüğü belirtilmeyen bir "sağlık düşüşü" yerine NET, sorgulanabilir
 *    bir durum geçişi tercih edildi (`HorseStatus` bu durumu zaten
 *    tanımlıyordu).
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 6 dersi burada BAŞTAN uygulanır:
 * her bağımlılık açık `@Inject()` ile enjekte edilir.
 */
@Injectable()
export class TrainHorseUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(HORSE_STATS_REPOSITORY) private readonly horseStatsRepository: HorseStatsRepository,
    @Inject(TRAINING_SESSION_REPOSITORY) private readonly trainingSessionRepository: TrainingSessionRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(horseId: string, input: TrainHorseInput): Promise<TrainHorseResult> {
    const horse = await this.horseRepository.findById(horseId);
    if (horse === null) {
      throw new HorseNotFoundError(horseId);
    }
    if (horse.status === 'injured') {
      throw new HorseInjuredError(horseId);
    }

    const stats = await this.horseStatsRepository.findByHorseId(horseId);
    if (stats === null) {
      // Veri bütünlüğü varsayımı: her at, `save()` sırasında bir
      // `horse_stats` satırıyla birlikte yaratılır (bkz.
      // `PostgresHorseRepository.save()`) — bu dala normal koşullarda
      // ULAŞILMAZ.
      throw new HorseNotFoundError(horseId);
    }

    const statKey: NumericHorseStatField | null = getPrimaryStatKey(input.type);
    const currentStatValue: number = statKey === null ? 0 : stats[statKey];
    const now = new Date();
    const ageMonths = calculateAgeInMonths(new Date(horse.birthDate), now);
    const vitals = {
      health: horse.health,
      fitness: horse.fitness,
      fatigue: horse.fatigue,
      energy: horse.energy,
      morale: horse.morale,
    };

    const outcome = applyTraining(this.config.training, {
      trainingType: input.type,
      intensity: input.intensity,
      durationMinutes: input.durationMinutes,
      currentStatValue,
      potential: horse.potential,
      vitals,
      ageMonths,
    });

    const sessionId = randomUUID();
    const injuryOccurred = rollInjuryOccurred(outcome.injuryRisk, `${sessionId}:injury`);
    const newVitals = applyVitalDelta(vitals, { fatigue: outcome.fatigueGain });

    const updatedHorse: Horse = {
      ...horse,
      fatigue: newVitals.fatigue,
      status: injuryOccurred ? 'injured' : horse.status,
      updatedAt: now.toISOString(),
    };
    await this.horseRepository.update(updatedHorse);

    const statChanges: Partial<Record<HorseStatField, number>> = {};
    if (statKey !== null && outcome.statGain > 0) {
      await this.horseStatsRepository.updateStatValue(horseId, statKey, currentStatValue + outcome.statGain);
      statChanges[statKey] = outcome.statGain;
    }

    await this.trainingSessionRepository.save({
      id: sessionId,
      horseId,
      type: input.type,
      intensity: input.intensity,
      durationMinutes: input.durationMinutes,
      statGain: statChanges,
      fatigueGain: outcome.fatigueGain,
      injuryRisk: outcome.injuryRisk,
      injuryOccurred,
      createdAt: now.toISOString(),
    });

    return {
      horseId,
      statChanges,
      fatigueGain: outcome.fatigueGain,
      injuryOccurred,
      newStatus: { fatigue: newVitals.fatigue, energy: newVitals.energy, morale: newVitals.morale },
    };
  }
}
