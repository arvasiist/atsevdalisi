import { Inject, Injectable } from '@nestjs/common';
import { loadQuestsConfig } from '@at-sevdalisi/game-config';
import type { EconomyReportView } from '@at-sevdalisi/shared-types';
import {
  assembleEconomyReport,
  parseEconomyReportPeriod,
  reportRangeStart,
} from '../../domain/economy/economy-report';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { WALLET_REPOSITORY, type WalletRepository } from '../ports/wallet.repository';

/**
 * GELİR-GİDER RAPORU (16.10.2026, brief §19) — oyuncunun çip defterinden son
 * N gün / ay; kanonik aile kırılımı cüzdanla aynı eşlemeden. Salt okuma.
 */
/** Oyunun TEK takvim saat dilimi (görevler, haftalık sıralama, dostluk hediyesiyle aynı). */
const TIMEZONE_OFFSET_MINUTES = loadQuestsConfig().timezoneOffsetMinutes;

@Injectable()
export class GetEconomyReportUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly wallet: WalletRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string, rawPeriod: unknown, now: Date = new Date()): Promise<EconomyReportView> {
    const period = parseEconomyReportPeriod(rawPeriod);
    const offset = TIMEZONE_OFFSET_MINUTES;
    const { dailyBuckets, monthlyBuckets } = this.config.economy.economyReport;
    const count = period === 'monthly' ? monthlyBuckets : dailyBuckets;
    const rows = await this.wallet.findLedgerBuckets(
      playerId,
      reportRangeStart(now, period, offset, count),
      period,
      offset,
    );
    return assembleEconomyReport(rows, period, now, offset, count);
  }
}
