import { Inject, Injectable } from '@nestjs/common';
import type { RaceWinnersPageView } from '@at-sevdalisi/shared-types';
import { resolveHippodromeKey } from '../../domain/race/hippodrome';
import {
  encodeRaceWinnersCursor,
  InvalidRaceWinnersQueryError,
  parseRaceWinnersQuery,
} from '../../domain/ranking/race-winners';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { LEADERBOARD_REPOSITORY, type LeaderboardRepository } from '../ports/leaderboard.repository';

/**
 * KAZANANLAR TABLOSU (16.10.2026, brief §12) — gerçek, bitmiş yarışların
 * birincileri; genel/sezon sıralamasından AYRI. Sayfa bir fazla satırla
 * okunur: fazlası varsa son gösterilen satır sonraki sayfanın imleci olur.
 */
@Injectable()
export class GetRaceWinnersUseCase {
  constructor(
    @Inject(LEADERBOARD_REPOSITORY) private readonly leaderboard: LeaderboardRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(raw: { limit?: unknown; from?: unknown; to?: unknown; before?: unknown }): Promise<RaceWinnersPageView> {
    const parsed = parseRaceWinnersQuery(raw, this.config.online.raceWinners);
    if (!parsed.ok) throw new InvalidRaceWinnersQueryError(parsed.problems);
    const { limit } = parsed.value;
    const records = await this.leaderboard.findRaceWinners({ ...parsed.value, limit: limit + 1 });
    const page = records.slice(0, limit);
    const last = page[page.length - 1];
    const tableLabel = (id: string) => this.config.economy.raceTiers.find((tier) => tier.id === id)?.label ?? id;
    return {
      rows: page.map((record) => ({
        raceId: record.raceId,
        raceName: record.raceName,
        completedAt: record.completedAt.toISOString(),
        hippodrome: resolveHippodromeKey(this.config.hippodromes, record.trackId),
        classLabel: record.isTournament ? 'Turnuva' : record.tableId ? tableLabel(record.tableId) : 'Masasız',
        fieldSize: record.fieldSize,
        playerId: record.playerId,
        username: record.username,
        displayName: record.displayName,
        horseId: record.horseId,
        horseName: record.horseName,
        finalTimeMs: record.finalTimeMs,
        prize: record.prize,
      })),
      nextCursor:
        records.length > limit && last ? encodeRaceWinnersCursor({ completedAt: last.completedAt, raceId: last.raceId }) : null,
    };
  }
}
