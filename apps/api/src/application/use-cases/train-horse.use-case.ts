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
import { horseAgeMonths } from '../../domain/horse/age-curve';
import {
  HorseInjuredError,
  HorseListedInMarketError,
  HorseNotFoundError,
  HorseRetiredError,
} from '../../domain/horse/errors';
import { computePersonalityTrainingEffects } from '../../domain/horse/personality';
import { applyVitalDelta } from '../../domain/horse/vital-signs';
import { applyXpGain } from '../../domain/progression/progression';
import { ManageStaffUseCase } from './manage-staff.use-case';
import { FarmEffectsService } from './farm-effects.service';
import {
  applyTraining,
  getPrimaryStatKey,
  rollInjuryOccurred,
} from '../../domain/training/training';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { HORSE_STATS_REPOSITORY, type HorseStatsRepository } from '../ports/horse-stats.repository';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';
import {
  TRAINING_SESSION_REPOSITORY,
  type TrainingSessionRepository,
} from '../ports/training-session.repository';
import {
  MARKET_LISTING_REPOSITORY,
  type MarketListingRepository,
} from '../ports/market-listing.repository';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';

export interface TrainHorseInput {
  type: TrainingType;
  intensity: TrainingIntensity;
  durationMinutes: number;
}

/**
 * `POST /horses/{id}/train` (docs/API.md §4, brief §10).
 *
 * AUDIT_REPORT.md Bulgu H2 (Medium):
 * Pazarda aktif ilanı olan bir at antrenmana sokulamaz.
 */
/** `horses` vital sütunlarının ölçeği (NUMERIC(5,2) → 2 ondalık). */
const VITAL_SCALE = 100;

@Injectable()
export class TrainHorseUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(HORSE_STATS_REPOSITORY) private readonly horseStatsRepository: HorseStatsRepository,
    @Inject(TRAINING_SESSION_REPOSITORY)
    private readonly trainingSessionRepository: TrainingSessionRepository,
    @Inject(MARKET_LISTING_REPOSITORY)
    private readonly marketListingRepository: MarketListingRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(ManageStaffUseCase) private readonly staff: ManageStaffUseCase,
    @Inject(FarmEffectsService) private readonly farmEffects: FarmEffectsService,
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
  ) {}

  async execute(horseId: string, input: TrainHorseInput): Promise<TrainHorseResult> {
    const horse = await this.horseRepository.findById(horseId);
    if (horse === null) {
      throw new HorseNotFoundError(horseId);
    }
    if (horse.status === 'injured') {
      throw new HorseInjuredError(horseId);
    }
    // 15.10.2026 — S5: emekli at antrenman yapamaz (yarış kariyeri bitti).
    if (horse.status === 'retired') {
      throw new HorseRetiredError(horseId);
    }

    // H2 KONTROLÜ: Pazarda aktif bir ilanı var mı?
    const activeListing = await this.marketListingRepository.findActiveByHorseId(horseId);
    if (activeListing !== null) {
      throw new HorseListedInMarketError(horseId);
    }

    const stats = await this.horseStatsRepository.findByHorseId(horseId);
    if (stats === null) {
      throw new HorseNotFoundError(horseId);
    }

    const statKey: NumericHorseStatField | null = getPrimaryStatKey(input.type);
    const currentStatValue: number = statKey === null ? 0 : stats[statKey];
    const now = new Date();
    // 01.10.2026 — antrenör etkisi (domain/staff). Süresi dolmuş antrenör 1 (nötr) döner.
    const trainerFactor = await this.staff.multiplierFor(horse.ownerId, 'trainer', now);
    // 01.10.2026 — antrenman pisti × nalbant alanı sakatlık olasılığını düşürür.
    const { trainingInjuryRiskMultiplier } = await this.farmEffects.effectsFor(horse.ownerId);
    // 08.10.2026 — atın kişiliği (gizli statlar): odak/rekabetçilik → kazanç,
    // stres dayanımı → yorgunluk, itaat → sakatlık. Nötr (50) at = çarpanlar 1.
    const personality = computePersonalityTrainingEffects(stats, input.intensity, this.config.horsePersonality);

    // AUDIT_REPORT.md Bulgu C2 hardening (bu oturum) — `horseRepository.updateWithLock`
    // (bkz. o metodun doc yorumu, `PlayerRepository.updateWithLock` ile AYNI
    // desen): `horses` satırı KİLİTLENDİKTEN SONRA yeniden okunur (`lockedHorse`)
    // ve TÜM vital hesaplamaları BUNUN ÜZERİNDEN yapılır — yukarıdaki `horse`
    // (kilit ÖNCESİ okuma) yalnızca uygunluk kontrolleri (sakat mı, pazarda
    // mı) için kullanıldı. İki eşzamanlı antrenman isteği artık birbirinin
    // fatigue/status yazımını SESSİZCE EZEMEZ.
    const lockResult = await this.horseRepository.updateWithLock(horseId, (lockedHorse) => {
      // Kilit öncesi okumadan sonra emekli edilmiş olabilir — kilit altında yeniden.
      if (lockedHorse.status === 'retired') {
        throw new HorseRetiredError(horseId);
      }
      const ageMonths = horseAgeMonths(lockedHorse, now, this.config.horseGrowth);
      const vitals = {
        health: lockedHorse.health,
        fitness: lockedHorse.fitness,
        fatigue: lockedHorse.fatigue,
        energy: lockedHorse.energy,
        morale: lockedHorse.morale,
      };

      const outcome = applyTraining(this.config.training, {
        trainingType: input.type,
        intensity: input.intensity,
        durationMinutes: input.durationMinutes,
        currentStatValue,
        potential: lockedHorse.potential,
        vitals,
        ageMonths,
        trainerFactor,
        personalityFactor: personality.gainMultiplier,
      });
      // Yorgunluk çarpanı yalnızca ARTIŞA uygulanır; dinlenmenin (negatif)
      // toparlaması kişilikle değişmez. Sütun NUMERIC(5,2): yanıt, DB'ye
      // yazılanla aynı olsun diye 2 haneye yuvarlanır.
      const fatigueGain =
        outcome.fatigueGain > 0
          ? Math.round(outcome.fatigueGain * personality.fatigueMultiplier * VITAL_SCALE) / VITAL_SCALE
          : outcome.fatigueGain;

      const sessionId = randomUUID();
      const injuryRisk = Math.min(
        1,
        Math.max(0, outcome.injuryRisk * trainingInjuryRiskMultiplier * personality.injuryRiskMultiplier),
      );
      const injuryOccurred = rollInjuryOccurred(injuryRisk, `${sessionId}:injury`);
      const newVitals = applyVitalDelta(vitals, { fatigue: fatigueGain });

      // 01.10.2026 — XP: at, kilit altında, vitallerle AYNI yazımda ilerler.
      const progression = this.config.progression;
      const horseProgress = applyXpGain(
        lockedHorse.level,
        lockedHorse.xp,
        progression.xpRewards.horse.trainingSession,
        progression,
      );

      const updatedHorse: Horse = {
        ...lockedHorse,
        fatigue: newVitals.fatigue,
        status: injuryOccurred ? 'injured' : lockedHorse.status,
        level: horseProgress.level,
        xp: horseProgress.xp,
        updatedAt: now.toISOString(),
      };

      return {
        horse: updatedHorse,
        result: { sessionId, injuryOccurred, injuryRisk, outcome: { ...outcome, fatigueGain }, newVitals },
      };
    });

    if (lockResult === null) {
      throw new HorseNotFoundError(horseId);
    }
    const { sessionId, injuryOccurred, injuryRisk, outcome, newVitals } = lockResult;

    const statChanges: Partial<Record<HorseStatField, number>> = {};
    if (statKey !== null && outcome.statGain > 0) {
      await this.horseStatsRepository.updateStatValue(
        horseId,
        statKey,
        currentStatValue + outcome.statGain,
      );
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
      // Kaydedilen risk, zarın GERÇEKTEN atıldığı (tesis sonrası) değerdir.
      injuryRisk,
      injuryOccurred,
      createdAt: now.toISOString(),
    });

    // Oyuncu XP'si (01.10.2026). Antrenman bir para yolu değildir ve atın
    // yazımı yukarıda ayrı bir kilitte tamamlandı; oyuncu satırı kendi
    // kilidiyle güncellenir (eşzamanlı iki antrenman XP'yi ezmesin diye).
    await this.playerRepository.updateWithLock(horse.ownerId, (player) => {
      const progress = applyXpGain(
        player.level,
        player.xp,
        this.config.progression.xpRewards.player.trainingSession,
        this.config.progression,
      );
      return {
        player: { ...player, level: progress.level, xp: progress.xp, updatedAt: now.toISOString() },
        result: null,
      };
    });

    return {
      horseId,
      statChanges,
      fatigueGain: outcome.fatigueGain,
      injuryOccurred,
      newStatus: { fatigue: newVitals.fatigue, energy: newVitals.energy, morale: newVitals.morale },
      staffMultiplier: trainerFactor,
    };
  }
}
