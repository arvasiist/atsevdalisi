import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  ScheduleTournamentsUseCase,
  type ScheduleTournamentsResult,
} from '../../application/use-cases/schedule-tournaments.use-case';
import { AppConfigService } from '../config/config.service';

const MS_PER_SECOND = 1000;

/**
 * Otomatik turnuva takvimi (30.09.2026, `FINAL_PROJECT_AUDIT.md` #50) —
 * `ScheduleTournamentsUseCase`i periyodik çağırır.
 *
 * `RaceLockScheduler`ın BEŞ kararı aynen geçerlidir (gerekçeler orada):
 * `setTimeout` zinciri · `unref()` · `NODE_ENV=test` iken kapalı (testler
 * `tickNow()` çağırır) · yeniden giriş kilidi · tur hatası yutulur.
 *
 * Config: `online.tournament.schedule` (`enabled`, `tickSeconds`).
 */
@Injectable()
export class TournamentScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TournamentScheduler.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isTicking = false;
  private isStopped = false;

  constructor(
    @Inject(ScheduleTournamentsUseCase) private readonly useCase: ScheduleTournamentsUseCase,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.config.online.tournament.schedule.enabled) {
      this.logger.log('Turnuva takvimi KAPALI (tournament.schedule.enabled = false).');
      return;
    }
    if (this.config.env.nodeEnv === 'test') {
      this.logger.log('Turnuva takvimi test ortamında kapalı; `tickNow()` elle çağrılmalıdır.');
      return;
    }
    // İlk tur hemen: sunucu açıldığında kademeler boş beklemesin.
    this.scheduleNext(0);
  }

  onModuleDestroy(): void {
    this.isStopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Zamanlayıcı kurulu mu — yalnızca `enabled`/`NODE_ENV` kararının testi için. */
  isRunning(): boolean {
    return this.timer !== null;
  }

  /** Bir tur. Yeniden girişte `null` döner (önceki tur sürüyor). */
  async tickNow(now: Date = new Date()): Promise<ScheduleTournamentsResult | null> {
    if (this.isTicking) {
      return null;
    }
    this.isTicking = true;
    try {
      return await this.useCase.execute(now);
    } finally {
      this.isTicking = false;
    }
  }

  private scheduleNext(delayMs: number = this.config.online.tournament.schedule.tickSeconds * MS_PER_SECOND): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tickNow()
        .catch((error: unknown) => {
          this.logger.error(`Turnuva takvimi turu düştü: ${error instanceof Error ? error.message : String(error)}`);
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
