import { Inject, Injectable } from '@nestjs/common';
import type { SeasonInfoView, SeasonStandingRow, SeasonView } from '@at-sevdalisi/shared-types';
import { buildLeaderboard, sumRankingScores } from '../../domain/ranking/leaderboard';
import { AppConfigService } from '../../infrastructure/config/config.service';
import type { PlayerRaceRecord } from '../ports/leaderboard.repository';
import { SEASON_REPOSITORY, type SeasonRepository } from '../ports/season.repository';

export interface SeasonTickResult {
  currentSeasonNumber: number;
  paidSeasons: Array<{ seasonId: string; payouts: number }>;
}

/**
 * SEZON (brief §69) — 01.10.2026'ya kadar DOMAIN ONLY.
 *
 * Sezon sıralaması GENEL sıralamanın formülüyle (`sumRankingScores` +
 * `buildLeaderboard`) ama yalnızca sezon penceresindeki yarışlardan
 * hesaplanır; ödül sırası ekranda gösterilenle ödenenin AYNI fonksiyondan
 * (`rankSeason`) çıkmasını garanti eder.
 */
@Injectable()
export class SeasonUseCase {
  constructor(
    @Inject(SEASON_REPOSITORY) private readonly seasons: SeasonRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async current(viewerId: string, now: Date = new Date()): Promise<SeasonView> {
    const { durationDays, leaderboardSize, rewardsByRank } = this.config.online.season;
    const season = await this.seasons.ensureCurrentSeason(now, durationDays);
    const standings = this.rankSeason(
      await this.seasons.findRecordsInWindow(season.startsAt, season.endsAt),
    );
    const previousSeason = await this.seasons.findPreviousSeason(now);
    return {
      season,
      standings: standings.slice(0, leaderboardSize),
      me: standings.find((row) => row.playerId === viewerId) ?? null,
      rewardsByRank,
      previous: previousSeason ? await this.podium(previousSeason) : null,
    };
  }

  /** Zamanlayıcı turu: güncel sezonu açık tut, bitmiş ve ödenmemiş sezonları öde. */
  async tick(now: Date = new Date()): Promise<SeasonTickResult> {
    const current = await this.seasons.ensureCurrentSeason(
      now,
      this.config.online.season.durationDays,
    );
    const paidSeasons: SeasonTickResult['paidSeasons'] = [];
    for (const season of await this.seasons.findUnpaidEndedSeasons(now)) {
      const payouts = await this.seasons.paySeasonRewards(season.id, now, (records) =>
        this.rankSeason(records).map((row) => ({ playerId: row.playerId, amount: row.reward })),
      );
      if (payouts !== null) {
        paidSeasons.push({ seasonId: season.id, payouts: payouts.length });
      }
    }
    return { currentSeasonNumber: current.number, paidSeasons };
  }

  /** Sıralama + sıra başına ödül. Eşit puanlılar aynı sırayı ve aynı ödülü paylaşır. */
  private rankSeason(records: PlayerRaceRecord[]): SeasonStandingRow[] {
    const rewardsByRank = this.config.online.season.rewardsByRank;
    const totals = sumRankingScores(records, this.config.online);
    const names = new Map(records.map((record) => [record.playerId, record]));
    const totalsByPlayer = new Map(totals.map((total) => [total.playerId, total]));
    return buildLeaderboard(
      totals.map((total) => ({
        playerId: total.playerId,
        scope: 'season' as const,
        scopeKey: null,
        score: total.score,
        updatedAt: total.lastFinishedAt,
      })),
    ).map((entry) => ({
      rank: entry.rank,
      playerId: entry.playerId,
      username: names.get(entry.playerId)?.username ?? '',
      displayName: names.get(entry.playerId)?.displayName ?? '',
      score: entry.score,
      raceCount: totalsByPlayer.get(entry.playerId)?.raceCount ?? 0,
      reward: rewardsByRank[entry.rank - 1] ?? 0,
    }));
  }

  private async podium(
    season: SeasonInfoView,
  ): Promise<{ season: SeasonInfoView; podium: SeasonStandingRow[] }> {
    const standings = this.rankSeason(
      await this.seasons.findRecordsInWindow(season.startsAt, season.endsAt),
    );
    return { season, podium: standings.filter((row) => row.rank <= 3) };
  }
}
