import { Inject, Injectable } from '@nestjs/common';
import type { CareerView } from '@at-sevdalisi/shared-types';
import { resolveCareerTier } from '../../domain/career/career';
import { resolveHippodromeKey } from '../../domain/race/hippodrome';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { CAREER_REPOSITORY, type CareerRepository } from '../ports/career.repository';

/**
 * KARİYER EKRANI (16.10.2026, brief §10) — çağıranın KENDİ kariyeri: puan,
 * kademe, sıradaki hedef, her kademenin açtıkları, puan tablosu ve son
 * yarışlar. Salt okuma; puan türetilir.
 */
@Injectable()
export class GetCareerUseCase {
  constructor(
    @Inject(CAREER_REPOSITORY) private readonly career: CareerRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string): Promise<CareerView> {
    const { career, economy, hippodromes } = this.config;
    const [points, history] = await Promise.all([
      this.career.pointsOf(playerId),
      this.career.historyOf(playerId, career.historyLimit),
    ]);
    const state = resolveCareerTier(points, career);
    const tableLabel = (id: string) => economy.raceTiers.find((tier) => tier.id === id)?.label ?? id;
    const classLabel = (classKey: string): string =>
      classKey === 'practice'
        ? 'Pratik / eşleşme'
        : classKey === 'open'
          ? 'Masasız lobi'
          : classKey === 'tournament'
            ? 'Turnuva'
            : tableLabel(classKey);
    return {
      points,
      tier: { key: state.tier.key, name: state.tier.name, index: state.index },
      next:
        state.next === null
          ? null
          : {
              key: state.next.key,
              name: state.next.name,
              requiredPoints: state.next.requiredPoints,
              pointsToNext: state.pointsToNext,
            },
      tiers: career.tiers.map((tier, index) => ({
        key: tier.key,
        name: tier.name,
        requiredPoints: tier.requiredPoints,
        description: tier.description,
        unlocksTables: tier.unlocksTables.map((id) => ({ id, label: tableLabel(id) })),
        unlocksHippodromes: hippodromes.hippodromes
          .filter((hippodrome) => tier.unlocksHippodromeLevels.includes(hippodrome.level))
          .map((hippodrome) => ({ key: hippodrome.key, name: hippodrome.name })),
        reached: index <= state.index,
      })),
      racePoints: Object.entries(career.racePoints).map(([classKey, values]) => ({
        classKey,
        classLabel: classLabel(classKey),
        points: [values[0], values[1], values[2], values[3]],
      })),
      history: history.map((row) => ({
        raceId: row.raceId,
        raceName: row.raceName,
        startTime: row.startTime.toISOString(),
        hippodrome: resolveHippodromeKey(hippodromes, row.trackId),
        classKey: row.classKey,
        classLabel: classLabel(row.classKey),
        finishPosition: row.finishPosition,
        fieldSize: row.fieldSize,
        points: row.points,
      })),
    };
  }
}
