import { SchedulerLeaderService } from './scheduler-leader';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  BreedingCenterUseCase,
  type BreedingDueResult,
} from '../../application/use-cases/breeding-center.use-case';
import { AppConfigService } from '../config/config.service';

const MS_PER_SECOND = 1000;

/**
 * ÇİFTLEŞTİRME MERKEZİ TURU (16.10.2026, brief §4–§5) — süresi dolan
 * teklifleri iade eder ve vakti gelen tayları doğurur. `AuctionSettleScheduler`
 * ile aynı desen: `NODE_ENV=test`te ve `genetics.breedingCenter.scheduler.
 * enabled=false` iken KAPALI; e2e `tickNow(gelecekTarih)` ile sürer. Sunucu
 * yeniden başlasa da gebelik DB'dedir; ilk turda vakti gelenler doğar. Çift
 * doğumu satır kilidi + `gestating → born` geçişi engeller.
 */
@Injectable()
export class BreedingScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BreedingScheduler.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isTicking = false;
  private isStopped = false;

  constructor(
    @Inject(SchedulerLeaderService) private readonly leader: SchedulerLeaderService,
    @Inject(BreedingCenterUseCase) private readonly useCase: BreedingCenterUseCase,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.config.genetics.breedingCenter.scheduler.enabled) {
      this.logger.log('Çiftleştirme merkezi turu KAPALI (genetics.breedingCenter.scheduler.enabled = false).');
      return;
    }
    if (this.config.env.nodeEnv === 'test') {
      this.logger.log('Çiftleştirme merkezi turu test ortamında kapalı; `tickNow()` elle çağrılmalıdır.');
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

  async tickNow(now: Date = new Date()): Promise<BreedingDueResult | null> {
    if (this.isTicking) {
      return null;
    }
    this.isTicking = true;
    try {
      return await this.useCase.runDue(now);
    } finally {
      this.isTicking = false;
    }
  }

  private scheduleNext(
    delayMs: number = this.config.genetics.breedingCenter.scheduler.tickSeconds * MS_PER_SECOND,
  ): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      // Yalnızca lider örnek koşar (çok örnekte çift iş olmasın — `scheduler-leader.ts`).
      void this.leader
        .runIfLeader(() => this.tickNow())
        .catch((error: unknown) => {
          this.logger.error(
            `Çiftleştirme merkezi turu düştü: ${error instanceof Error ? error.message : String(error)}`,
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
