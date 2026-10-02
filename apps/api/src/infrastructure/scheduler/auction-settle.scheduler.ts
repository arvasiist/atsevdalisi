import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  MarketAuctionUseCase,
  type SettleDueAuctionsResult,
} from '../../application/use-cases/market-auction.use-case';
import { AppConfigService } from '../config/config.service';

const MS_PER_SECOND = 1000;

/**
 * MÜZAYEDE KAPANIŞI (02.10.2026) — süresi dolan müzayedeleri kapatır (satış
 * ya da iade). `RaceCalendarScheduler` ile aynı desen: `NODE_ENV=test`te ve
 * `economy.auction.settleScheduler.enabled=false` iken KAPALI; e2e
 * `tickNow()` ile sürer. Kapanış satır kilidiyle korunur — iki tur (ya da iki
 * örnek) aynı ilanı iki kez kapatamaz.
 */
@Injectable()
export class AuctionSettleScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuctionSettleScheduler.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isTicking = false;
  private isStopped = false;

  constructor(
    @Inject(MarketAuctionUseCase) private readonly useCase: MarketAuctionUseCase,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.config.economy.auction.settleScheduler.enabled) {
      this.logger.log(
        'Müzayede kapanışı KAPALI (economy.auction.settleScheduler.enabled = false).',
      );
      return;
    }
    if (this.config.env.nodeEnv === 'test') {
      this.logger.log('Müzayede kapanışı test ortamında kapalı; `tickNow()` elle çağrılmalıdır.');
      return;
    }
    this.scheduleNext(0);
  }

  onModuleDestroy(): void {
    this.isStopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  async tickNow(now: Date = new Date()): Promise<SettleDueAuctionsResult | null> {
    if (this.isTicking) {
      return null;
    }
    this.isTicking = true;
    try {
      return await this.useCase.settleDue(now);
    } finally {
      this.isTicking = false;
    }
  }

  private scheduleNext(
    delayMs: number = this.config.economy.auction.settleScheduler.tickSeconds * MS_PER_SECOND,
  ): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tickNow()
        .catch((error: unknown) => {
          this.logger.error(
            `Müzayede kapanış turu düştü: ${error instanceof Error ? error.message : String(error)}`,
          );
        })
        .finally(() => {
          if (!this.isStopped) {
            this.scheduleNext();
          }
        });
    }, delayMs);
    this.timer.unref?.();
  }
}
