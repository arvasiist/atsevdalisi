import { SchedulerLeaderService } from './scheduler-leader';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  ScheduleRaceCalendarUseCase,
  type ScheduleRaceCalendarResult,
} from '../../application/use-cases/schedule-race-calendar.use-case';
import { AppConfigService } from '../config/config.service';

const MS_PER_SECOND = 1000;

/**
 * YARIŞ TAKVİMİ (01.10.2026) — `ScheduleRaceCalendarUseCase`i periyodik
 * çağırır. `TournamentScheduler` ile aynı beş karar (`setTimeout` zinciri ·
 * `unref()` · `NODE_ENV=test` iken kapalı, testler `tickNow()` çağırır ·
 * yeniden giriş kilidi · tur hatası yutulur).
 *
 * Config: `race-lobby.config.json` → `calendar` (`enabled`, `tickSeconds`).
 */
@Injectable()
export class RaceCalendarScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RaceCalendarScheduler.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isTicking = false;
  private isStopped = false;

  constructor(
    @Inject(SchedulerLeaderService) private readonly leader: SchedulerLeaderService,
    @Inject(ScheduleRaceCalendarUseCase) private readonly useCase: ScheduleRaceCalendarUseCase,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.config.raceLobby.calendar.enabled) {
      this.logger.log('Yarış takvimi KAPALI (raceLobby.calendar.enabled = false).');
      return;
    }
    if (this.config.env.nodeEnv === 'test') {
      this.logger.log('Yarış takvimi test ortamında kapalı; `tickNow()` elle çağrılmalıdır.');
      return;
    }
    // İlk tur hemen: sunucu açıldığında lobi boş beklemesin.
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
  async tickNow(now: Date = new Date()): Promise<ScheduleRaceCalendarResult | null> {
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

  private scheduleNext(
    delayMs: number = this.config.raceLobby.calendar.tickSeconds * MS_PER_SECOND,
  ): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      // Yalnızca lider örnek koşar (çok örnekte çift iş olmasın — `scheduler-leader.ts`).
      void this.leader
        .runIfLeader(() => this.tickNow())
        .catch((error: unknown) => {
          this.logger.error(
            `Yarış takvimi turu düştü: ${error instanceof Error ? error.message : String(error)}`,
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
