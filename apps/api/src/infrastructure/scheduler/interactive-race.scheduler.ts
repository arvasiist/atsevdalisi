import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { InteractiveRaceUseCase } from '../../application/use-cases/interactive-race.use-case';
import { RACE_REPOSITORY, type RaceRepository } from '../../application/ports/race.repository';
import { AppConfigService } from '../config/config.service';

const MS_PER_SECOND = 1000;

/**
 * 01.10.2026 — süresi dolan oyuncu kontrollü yarışları kesinleştirir: oyuncu
 * sayfayı kapatsa da ödül/XP yazılır ve ücretten kaçılamaz.
 * `TournamentScheduler`ın beş kararı aynen geçerli (`setTimeout` zinciri ·
 * `unref()` · `NODE_ENV=test` iken kapalı, testler `tickNow()` çağırır ·
 * yeniden giriş kilidi · tur hatası yutulur).
 * Config: `interactive-race.config.json` → `scheduler`.
 */
@Injectable()
export class InteractiveRaceScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InteractiveRaceScheduler.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isTicking = false;
  private isStopped = false;

  constructor(
    @Inject(InteractiveRaceUseCase) private readonly useCase: InteractiveRaceUseCase,
    @Inject(RACE_REPOSITORY) private readonly raceRepository: RaceRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.config.interactiveRace.scheduler.enabled) {
      this.logger.log('Kontrollü yarış zamanlayıcısı KAPALI.');
      return;
    }
    if (this.config.env.nodeEnv === 'test') {
      this.logger.log(
        'Kontrollü yarış zamanlayıcısı test ortamında kapalı; `tickNow()` elle çağrılmalıdır.',
      );
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

  /** Bir tur: süren oturumları dener; kesinleşen sayısını döner (yeniden girişte `null`). */
  async tickNow(now: Date = new Date()): Promise<number | null> {
    if (this.isTicking) {
      return null;
    }
    this.isTicking = true;
    try {
      const ids = await this.raceRepository.findRunningInteractiveRaceIds(
        this.config.interactiveRace.scheduler.batchSize,
      );
      let finished = 0;
      for (const id of ids) {
        try {
          if ((await this.useCase.tryFinish(id, now)) === 'finished') {
            finished += 1;
          }
        } catch (error: unknown) {
          // Bir oturumun hatası diğerlerini durdurmaz.
          this.logger.error(
            `Kontrollü yarış ${id} kesinleşemedi: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      return finished;
    } finally {
      this.isTicking = false;
    }
  }

  private scheduleNext(
    delayMs: number = this.config.interactiveRace.scheduler.tickSeconds * MS_PER_SECOND,
  ): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tickNow()
        .catch((error: unknown) => {
          this.logger.error(
            `Kontrollü yarış turu düştü: ${error instanceof Error ? error.message : String(error)}`,
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
