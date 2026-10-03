import { Inject, Injectable } from '@nestjs/common';
import type { AnomalyPlayerRef, AnomalyReport } from '@at-sevdalisi/shared-types';
import { loadAnticheatConfig } from '@at-sevdalisi/game-config';
import { assertStaffPermission } from '../../domain/admin/staff';
import { accountAgeDays } from '../../domain/anticheat/anomaly';
import { ANOMALY_REPOSITORY, type AnomalyRepository } from '../ports/anomaly.repository';
import { MODERATION_REPOSITORY, type ModerationRepository } from '../ports/moderation.repository';

const config = loadAnticheatConfig();
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * ŞÜPHELİ DESEN LİSTESİ (02.10.2026, Faz 7). Yönetici + moderatör
 * (`anomalies.view`), yetki VERİ OKUMADAN ÖNCE. Bulgu ceza DEĞİLDİR —
 * karar yönetimindir (askı/yasak ayrı uçtan, denetim kaydıyla).
 */
@Injectable()
export class ListAnomaliesUseCase {
  constructor(
    @Inject(ANOMALY_REPOSITORY) private readonly repository: AnomalyRepository,
    @Inject(MODERATION_REPOSITORY) private readonly moderation: ModerationRepository,
  ) {}

  async execute(actorId: string, now: Date = new Date()): Promise<AnomalyReport> {
    assertStaffPermission(await this.moderation.findRole(actorId), 'anomalies.view');
    const raw = await this.repository.findAnomalies({
      since: new Date(now.getTime() - config.windowDays * MS_PER_DAY),
      newAccountDays: config.newAccountDays,
      minDistinctNewSenders: config.giftFunnel.minDistinctNewSenders,
      minPairTrades: config.repeatTradePair.minTrades,
      minOutflowMoney: config.newAccountOutflow.minMoney,
      limit: config.maxFindingsPerRule,
    });
    const ids = [...new Set(raw.flatMap((finding) => [finding.subjectId, ...finding.counterpartIds]))];
    const players = new Map((await this.repository.findPlayers(ids)).map((player) => [player.id, player]));
    const ref = (id: string): AnomalyPlayerRef => {
      const player = players.get(id);
      return {
        playerId: id,
        username: player?.username ?? '?',
        accountAgeDays: player ? accountAgeDays(player.createdAt, now) : 0,
      };
    };
    return {
      generatedAt: now.toISOString(),
      windowDays: config.windowDays,
      newAccountDays: config.newAccountDays,
      findings: raw.map((finding) => ({
        rule: finding.rule,
        subject: ref(finding.subjectId),
        counterparts: finding.counterpartIds.map(ref),
        count: finding.count,
        totalMoney: finding.totalMoney,
        totalGems: finding.totalGems,
        firstAt: finding.firstAt.toISOString(),
        lastAt: finding.lastAt.toISOString(),
      })),
    };
  }
}
