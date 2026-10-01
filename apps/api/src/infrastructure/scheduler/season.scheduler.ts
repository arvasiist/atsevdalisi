import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { SeasonUseCase, type SeasonTickResult } from '../../application/use-cases/season.use-case';
import { AppConfigService } from '../config/config.service';

const MS_PER_SECOND = 1000;

/**
 * SEZON ZAMANLAYICISI (01.10.2026) — güncel sezonu açık tutar ve biten
 * sezonun ödülünü öder. `TournamentScheduler` ile aynı desen: `NODE_ENV=test`
 * iken ve `season.schedule.enabled=false` iken KAPALIDIR; e2e `tickNow()`
 * çağırır. Çift ödemeyi zamanlayıcı değil `rewards_paid_at` kapısı (kilit
 * altında) engeller — iki süreç aynı anda koşsa da sezon bir kez ödenir.
 */
@Injectable()
export class SeasonScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SeasonScheduler.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isTicking = false;
  private isStopped = false;

  constructor(
    @Inject(SeasonUseCase) private readonly useCase: SeasonUseCase,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.config.online.season.schedule.enabled) {
      this.logger.log('Sezon zamanlayıcısı KAPALI (season.schedule.enabled = false).');
      return;
    }
    if (this.config.env.nodeEnv === 'test') {
      this.logger.log('Sezon zamanlayıcısı test ortamında kapalı; `tickNow()` elle çağrılmalıdır.');
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

  async tickNow(now: Date = new Date()): Promise<SeasonTickResult | null> {
    if (this.isTicking) {
      return null;
    }
    this.isTicking = true;
    try {
      return await this.useCase.tick(now);
    } finally {
      this.isTicking = false;
    }
  }

  private scheduleNext(
    delayMs: number = this.config.online.season.schedule.tickSeconds * MS_PER_SECOND,
  ): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tickNow()
        .catch((error: unknown) => {
          this.logger.error(
            `Sezon turu düştü: ${error instanceof Error ? error.message : String(error)}`,
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
