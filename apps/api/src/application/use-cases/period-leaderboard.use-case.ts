import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { PeriodLeaderboardView, PeriodStandingRow } from '@at-sevdalisi/shared-types';
import { loadQuestsConfig } from '@at-sevdalisi/game-config';
import { rankPlayerTotals, sumRankingScores } from '../../domain/ranking/leaderboard';
import { isLeaderboardPeriod, periodWindow } from '../../domain/ranking/period-window';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { SEASON_REPOSITORY, type SeasonRepository } from '../ports/season.repository';

const calendar = loadQuestsConfig();

/**
 * HAFTALIK / AYLIK SIRALAMA (02.10.2026, Faz 11 "Leaderboard Resets", brief
 * §43). Sezonla AYNI kayıt kaynağı (`findRecordsInWindow`) ve AYNI formül
 * (`sumRankingScores` + `buildLeaderboard`) — ikinci bir puan defteri yok,
 * yani dönem sıralaması genel sıralamayla ayrışamaz. Ödül yoktur.
 */
@Injectable()
export class PeriodLeaderboardUseCase {
  constructor(
    @Inject(SEASON_REPOSITORY) private readonly seasons: SeasonRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(viewerId: string, rawPeriod: unknown, now: Date = new Date()): Promise<PeriodLeaderboardView> {
    if (!isLeaderboardPeriod(rawPeriod)) {
      throw new BadRequestException("Dönem 'weekly' ya da 'monthly' olmalıdır.");
    }
    const window = periodWindow(rawPeriod, now, calendar);
    const records = await this.seasons.findRecordsInWindow(window.start.toISOString(), window.end.toISOString());
    const totals = sumRankingScores(records, this.config.online);
    const names = new Map(records.map((record) => [record.playerId, record]));
    const ranked: PeriodStandingRow[] = rankPlayerTotals(totals).map((entry) => ({
      rank: entry.rank,
      playerId: entry.playerId,
      username: names.get(entry.playerId)?.username ?? '',
      displayName: names.get(entry.playerId)?.displayName ?? '',
      score: entry.score,
      raceCount: entry.raceCount,
      wins: entry.wins,
    }));
    return {
      period: rawPeriod,
      startsAt: window.start.toISOString(),
      endsAt: window.end.toISOString(),
      standings: ranked.slice(0, this.config.online.leaderboardPeriods.limit),
      me: ranked.find((row) => row.playerId === viewerId) ?? null,
    };
  }
}
