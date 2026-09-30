import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { JoinMatchmakingQueueUseCase } from '../../application/use-cases/join-matchmaking-queue.use-case';
import { AppConfigService } from '../config/config.service';

const MS_PER_SECOND = 1000;

/**
 * Eşleştirme kuyruğu tarayıcısı (30.09.2026, `FINAL_PROJECT_AUDIT.md` #21).
 *
 * Eşleştirme eskiden YALNIZCA `POST /matchmaking/queue` anında deneniyordu:
 * kuyrukta bekleyen iki oyuncu, aralıkları zamanla genişleyip uyumlu hâle
 * gelse bile yeni biri katılmadıkça hiç eşleşmiyordu. Bu sınıf
 * `JoinMatchmakingQueueUseCase.scanQueue`u periyodik çağırır.
 *
 * `RaceLockScheduler`ın BEŞ kararı aynen geçerlidir (gerekçeler orada):
 * `setTimeout` zinciri (`setInterval` değil) · `unref()` · `NODE_ENV=test`
 * iken kapalı (testler `tickNow()` çağırır) · yeniden giriş kilidi · tur
 * hatası yutulur, zincir ölmez. Ayrı bir sınıf olmasının tek sebebi modül
 * grafiğidir: `RaceModule` `MatchmakingModule`ü içe aktarsaydı
 * `Matchmaking → Realtime → Race` üzerinden döngü doğardı.
 *
 * Config: `online.matchmaking.queueScan` (`enabled`, `tickSeconds`).
 */
@Injectable()
export class MatchmakingScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchmakingScheduler.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isTicking = false;
  private isStopped = false;

  constructor(
    @Inject(JoinMatchmakingQueueUseCase) private readonly matchmaking: JoinMatchmakingQueueUseCase,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.config.online.matchmaking.queueScan.enabled) {
      this.logger.log('Eşleştirme kuyruğu taraması KAPALI (queueScan.enabled = false).');
      return;
    }
    if (this.config.env.nodeEnv === 'test') {
      this.logger.log('Eşleştirme kuyruğu taraması test ortamında kapalı; `tickNow()` elle çağrılmalıdır.');
      return;
    }
    this.scheduleNext();
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
  async tickNow(now: Date = new Date()): Promise<{ matched: number } | null> {
    if (this.isTicking) {
      return null;
    }
    this.isTicking = true;
    try {
      const result = await this.matchmaking.scanQueue(now);
      if (result.matched > 0) {
        this.logger.log(`Kuyruk taramasında ${result.matched} eşleşme koşuldu.`);
      }
      return result;
    } finally {
      this.isTicking = false;
    }
  }

  private scheduleNext(): void {
    const delayMs = this.config.online.matchmaking.queueScan.tickSeconds * MS_PER_SECOND;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tickNow()
        .catch((error: unknown) => {
          this.logger.error(
            `Eşleştirme kuyruğu turu düştü: ${error instanceof Error ? error.message : String(error)}`,
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
