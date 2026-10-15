import { SchedulerLeaderService } from './scheduler-leader';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { RecoverHorseVitalsUseCase } from '../../application/use-cases/recover-horse-vitals.use-case';
import { AppConfigService } from '../config/config.service';

const MS_PER_SECOND = 1000;

/**
 * ZAMANLA TOPARLANMA (15.10.2026, S3). Her `care.passiveRecovery.tickSeconds`
 * saniyede bir tur: dolu olmayan atlara geçen süre kadar enerji eklenir,
 * yorgunluk düşer (tek atomik ifade, aynı `now` ile ikinci tur no-op).
 * `NODE_ENV=test`te ve `passiveRecovery.enabled=false` iken KAPALI; e2e
 * `tickNow(tarih)` ile sürer. Yalnızca lider örnek koşar.
 */
@Injectable()
export class HorseRecoveryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HorseRecoveryScheduler.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isTicking = false;
  private isStopped = false;

  constructor(
    @Inject(SchedulerLeaderService) private readonly leader: SchedulerLeaderService,
    @Inject(RecoverHorseVitalsUseCase) private readonly useCase: RecoverHorseVitalsUseCase,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.config.care.passiveRecovery.enabled) {
      this.logger.log('At toparlanması KAPALI (care.passiveRecovery.enabled = false).');
      return;
    }
    if (this.config.env.nodeEnv === 'test') {
      this.logger.log('At toparlanması test ortamında kapalı; `tickNow()` elle çağrılmalıdır.');
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

  async tickNow(now: Date = new Date()): Promise<{ recovered: number } | null> {
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

  private scheduleNext(delayMs: number = this.config.care.passiveRecovery.tickSeconds * MS_PER_SECOND): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      // Yalnızca lider örnek koşar (çok örnekte çift toparlanma olmasın — `scheduler-leader.ts`).
      void this.leader
        .runIfLeader(() => this.tickNow())
        .catch((error: unknown) => {
          this.logger.error(
            `At toparlanma turu düştü: ${error instanceof Error ? error.message : String(error)}`,
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
