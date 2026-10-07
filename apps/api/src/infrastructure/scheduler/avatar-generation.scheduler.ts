import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { loadAvatarConfig } from '@at-sevdalisi/game-config';
import { AVATAR_GENERATION_PROVIDER, type AvatarGenerationProvider } from '../../application/ports/avatar-generation.provider';
import { AvatarGenerationUseCase } from '../../application/use-cases/avatar-generation.use-case';
import { AppConfigService } from '../config/config.service';
import { SchedulerLeaderService } from './scheduler-leader';

const MS_PER_SECOND = 1000;

/**
 * AVATAR ÜRETİM İŞLERİ ZAMANLAYICISI (07.10.2026, Faz 8-B). Uzun AI işleri
 * HTTP isteğinde koşmaz (brief §41); bu tur etkin işleri sağlayıcıyla
 * ilerletir. `RaceLockScheduler` kararları aynen: `setTimeout` zinciri,
 * `unref`, test ortamında kapalı (`tickNow()`), yeniden giriş kilidi, tur
 * hatası yutulur. Sağlayıcı yoksa HİÇ kurulmaz. Yalnızca lider örnek koşar.
 */
@Injectable()
export class AvatarGenerationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AvatarGenerationScheduler.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isTicking = false;
  private isStopped = false;

  constructor(
    @Inject(SchedulerLeaderService) private readonly leader: SchedulerLeaderService,
    @Inject(AvatarGenerationUseCase) private readonly generation: AvatarGenerationUseCase,
    @Inject(AVATAR_GENERATION_PROVIDER) private readonly provider: AvatarGenerationProvider | null,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  onModuleInit(): void {
    if (this.provider === null) {
      this.logger.log('AI avatar sağlayıcısı yapılandırılmadı — avatar işleri zamanlayıcısı KAPALI.');
      return;
    }
    if (this.config.env.nodeEnv === 'test') return;
    this.scheduleNext();
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

  async tickNow(now: Date = new Date()): Promise<{ advanced: number } | null> {
    if (this.isTicking) return null;
    this.isTicking = true;
    try {
      return await this.generation.advance(now);
    } finally {
      this.isTicking = false;
    }
  }

  private scheduleNext(): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.leader
        .runIfLeader(() => this.tickNow())
        .catch((error: unknown) => {
          this.logger.error(`Avatar işleri turu düştü: ${error instanceof Error ? error.name : 'hata'}`);
        })
        .finally(() => {
          if (!this.isStopped) this.scheduleNext();
        });
    }, loadAvatarConfig().generation.pollSeconds * MS_PER_SECOND);
    this.timer.unref?.();
  }
}
