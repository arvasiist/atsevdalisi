import { SchedulerLeaderService } from './scheduler-leader';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ExpireMarketListingsUseCase } from '../../application/use-cases/expire-market-listings.use-case';
import { AppConfigService } from '../config/config.service';

const MS_PER_SECOND = 1000;

/**
 * SABİT FİYATLI İLAN SÜRE DOLUMU (08.10.2026). Eskiden süre dolumu YALNIZCA
 * okuma anında (tembel) yazılıyordu: kimse pazara bakmazsa ilan `active`
 * kalıyor, satıcı da süresinin dolduğunu hiç öğrenmiyordu. `AuctionSettle
 * Scheduler` ile aynı desen: `NODE_ENV=test`te ve
 * `economy.listingExpiry.enabled=false` iken KAPALI; e2e `tickNow()` ile sürer.
 * Geçiş tek atomik ifadededir — iki tur (ya da iki örnek) aynı ilanı iki kez
 * işleyemez, satıcıya iki bildirim gitmez.
 */
@Injectable()
export class MarketListingExpiryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketListingExpiryScheduler.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isTicking = false;
  private isStopped = false;

  constructor(
    @Inject(SchedulerLeaderService) private readonly leader: SchedulerLeaderService,
    @Inject(ExpireMarketListingsUseCase) private readonly useCase: ExpireMarketListingsUseCase,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.config.economy.listingExpiry.enabled) {
      this.logger.log('İlan süre dolumu KAPALI (economy.listingExpiry.enabled = false).');
      return;
    }
    if (this.config.env.nodeEnv === 'test') {
      this.logger.log('İlan süre dolumu test ortamında kapalı; `tickNow()` elle çağrılmalıdır.');
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

  async tickNow(now: Date = new Date()): Promise<{ expired: string[] } | null> {
    if (this.isTicking) {
      return null;
    }
    this.isTicking = true;
    try {
      return await this.useCase.expireDue(now);
    } finally {
      this.isTicking = false;
    }
  }

  private scheduleNext(delayMs: number = this.config.economy.listingExpiry.tickSeconds * MS_PER_SECOND): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      // Yalnızca lider örnek koşar (çok örnekte çift iş olmasın — `scheduler-leader.ts`).
      void this.leader
        .runIfLeader(() => this.tickNow())
        .catch((error: unknown) => {
          this.logger.error(
            `İlan süre dolumu turu düştü: ${error instanceof Error ? error.message : String(error)}`,
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
