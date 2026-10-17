import { Inject, Injectable } from '@nestjs/common';
import type {
  FeedType,
  Horse,
  HorseNeedsView,
  HorsePersonalityView,
  HorseUpbringingView,
  HorseVisibleStats,
} from '@at-sevdalisi/shared-types';
import { describePersonality } from '../../domain/horse/personality';
import { horseRacingPower } from '../../domain/race/practice-class';
import { computeHorseNeeds, hungerFeedTypes, toHorseNeedsView } from '../../domain/care/needs';
import { estimateRaceReadyAt } from '../../domain/care/race-condition';
import { getStableCapacity, getStableRecoveryMultiplier } from '../../domain/stable/stable';
import { resolveStableLayout } from '../../domain/stable/layout';
import { getLifeStage, horseAgeMonths } from '../../domain/horse/age-curve';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { HORSE_STATS_REPOSITORY, type HorseStatsRepository } from '../ports/horse-stats.repository';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';

/**
 * brief §39 Ahır ekranı, `GET /horses` (docs/API.md §4 "oyuncunun
 * ahırındaki atlar"). Sahiplik kapısı controller'dadır (`assertSelf`).
 *
 * 08.10.2026 — her at kişilik ETİKETİYLE döner (`describePersonality`,
 * gizli sayılardan sunucuda türetilir; sayı istemciye gitmez). Tek sorgu:
 * N at için N okuma yapılmaz.
 *
 * 14.10.2026 — her at pratik yarış SINIF GÜCÜYLE döner (`horseRacingPower`);
 * yarış ekranı girebileceği kademeyi bununla gösterir (kural sunucuda).
 *
 * 15.10.2026 — yorgunluk/enerji yüzünden yarışa hazır değilse ne zaman
 * hazır olacağı (`raceReadyAt`, zamanla toparlanma hızından; S3).
 *
 * 16.10.2026 — görünür yarış statları (`stats`; brief §3). Sınıf gücü aynı
 * satırdan hesaplanır (ikinci sorgu yok).
 */
@Injectable()
export class ListHorsesByOwnerUseCase {
  constructor(
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(HORSE_STATS_REPOSITORY) private readonly horseStatsRepository: HorseStatsRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(
    ownerId: string,
    now: Date = new Date(),
  ): Promise<
    Array<{
      horse: Horse;
      personality: HorsePersonalityView | null;
      racingPower: number | null;
      raceReadyAt: string | null;
      /** 15.10.2026 — oyun yaşı (ay), sunucuda hesaplanır. */
      ageMonths: number;
      /** 15.10.2026 — B13: yaş evresi + yarış çarpanı (kadroya donan değerle aynı kural). */
      lifeStage: { name: string; racingFactor: number };
      stats: HorseVisibleStats | null;
      upbringing: HorseUpbringingView | null;
      /** 16.10.2026 — ahırdaki bölmesi (1..kapasite). */
      stallNumber: number;
      /** 17.10.2026 (brief §14) — yem/su ihtiyacı (son beslenme/sudan türetilir). */
      needs: HorseNeedsView | null;
    }>
  > {
    const horses = await this.horseRepository.findByOwnerId(ownerId);
    const ids = horses.map((horse) => horse.id);
    // 16.10.2026 — tay büyütme: yetiştirme kazancı veren (yaşa sınırlı) kalem.
    const upbringingFeed = (Object.entries(this.config.care.feedTypes) as Array<[FeedType, (typeof this.config.care.feedTypes)[FeedType]]>).find(
      ([, effect]) => effect.upbringingStatGain !== undefined && effect.allowedLifeStages !== undefined,
    );
    const [traits, visibleStats, upbringingCounts, stableLevel, stallRows, needTimestamps] = await Promise.all([
      this.horseStatsRepository.findPersonalityByHorseIds(ids),
      this.horseStatsRepository.findVisibleStatsByHorseIds(ids),
      upbringingFeed
        ? this.horseStatsRepository.findFeedCountsByHorseIds(ids, upbringingFeed[0])
        : Promise.resolve(new Map<string, number>()),
      this.horseStatsRepository.findOwnerStableLevel(ownerId),
      this.horseStatsRepository.findStallRowsByOwner(ownerId),
      this.horseStatsRepository.findNeedTimestampsByHorseIds(ids, hungerFeedTypes(this.config.care)),
    ]);
    // 16.10.2026 — bölmeler: ekran, özet ve taşıma ucu AYNI yerleşim kuralı.
    const stallByHorse = new Map(
      resolveStableLayout(stallRows, getStableCapacity(stableLevel, this.config.stable)).map((entry) => [
        entry.horseId,
        entry.stallNumber,
      ]),
    );
    // 16.10.2026 — ahır konfor çarpanı: tahmin zamanlayıcıyla AYNI hızla yapılır.
    const recoveryMultiplier = getStableRecoveryMultiplier(stableLevel, this.config.stable);
    return horses.map((horse) => {
      const values = traits.get(horse.id);
      const power = visibleStats.get(horse.id);
      const ageMonths = horseAgeMonths(horse, now, this.config.horseGrowth);
      const stage = getLifeStage(ageMonths, this.config.horseGrowth);
      const needTimes = needTimestamps.get(horse.id);
      return {
        horse,
        personality: values ? describePersonality(values, this.config.horsePersonality) : null,
        // B13 — yaşa göre ETKİN güç: pratik sınıf kapısı da bunu kullanır.
        racingPower: power ? horseRacingPower(power) * stage.racingFactor : null,
        raceReadyAt:
          estimateRaceReadyAt(
            horse.status,
            horse,
            this.config.race.readiness,
            this.config.care.passiveRecovery,
            now,
            ageMonths,
            recoveryMultiplier,
          )?.toISOString() ?? null,
        ageMonths,
        lifeStage: { name: stage.name, racingFactor: stage.racingFactor },
        stats: power ?? null,
        stallNumber: stallByHorse.get(horse.id) ?? 0,
        needs: needTimes ? toHorseNeedsView(computeHorseNeeds(needTimes, now, this.config.care.needs)) : null,
        upbringing:
          upbringingFeed && upbringingFeed[1].allowedLifeStages!.includes(stage.name)
            ? this.upbringingView(upbringingFeed[0], upbringingFeed[1], upbringingCounts.get(horse.id) ?? 0)
            : null,
      };
    });
  }

  private upbringingView(
    feedType: FeedType,
    effect: (typeof this.config.care.feedTypes)[FeedType],
    feedsUsed: number,
  ): HorseUpbringingView {
    const feedsMax = this.config.care.upbringing.maxFeedsPerHorse;
    const unitPrice = effect.price?.amount ?? 0;
    return {
      feedType,
      feedsUsed: Math.min(feedsUsed, feedsMax),
      feedsMax,
      gainPerFeed: effect.upbringingStatGain ?? 0,
      unitPrice,
      remainingCost: Math.max(0, feedsMax - feedsUsed) * unitPrice,
    };
  }
}
