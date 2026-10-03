import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { loadOpsConfig } from '@at-sevdalisi/game-config';
import { AppConfigService } from '../config/config.service';
import { PG_POOL } from '../database/database.module';

const MS_PER_SECOND = 1000;

/**
 * ZAMANLAYICI LİDER KİLİDİ (02.10.2026, Faz 13 — yatay ölçek önkoşulu).
 *
 * Zamanlayıcılar API sürecinin içinde koşar; iki örnek açılınca kilit,
 * kesinleşme, takvim, sezon, müzayede… her işi İKİ kez koşardı. Satır
 * kilitleri çift ÖDEMEYİ zaten engelliyor; bu servis çift İŞİ engeller.
 *
 * Mekanizma: ayrılmış bir havuz bağlantısında OTURUM düzeyinde
 * `pg_try_advisory_lock`. Kilidi tutan örnek lider olur ve bağlantıyı
 * bırakmaz. Süreç ölürse ya da bağlantı koparsa Postgres oturumu kapatır ve
 * kilit KENDİLİĞİNDEN düşer; izleyiciler `retrySeconds`te bir dener ve
 * devralır. Lider `heartbeatSeconds`te bir bağlantısını yoklar; yoklama
 * düşerse liderliği BIRAKIR (kısa bir an iki lider olabilir — satır kilitleri
 * o anı da doğru tutar, yalnızca iş tekrarlanır).
 *
 * `tickNow()` (testler, elle tetikleme) bu kapıdan GEÇMEZ; yalnızca
 * zamanlayıcıların kendi zamanlanmış turu `runIfLeader` ile sarılır.
 */
@Injectable()
export class SchedulerLeaderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerLeaderService.name);
  /** Testler ayrı bir anahtarla alt sınıfta ezer (çalışan başka bir örnek gerçek anahtarı tutabilir). */
  protected readonly settings = loadOpsConfig().schedulerLeader;
  private client: PoolClient | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private leader = false;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  onModuleInit(): void {
    // Kapalıysa her örnek lider (eski tek örnek davranışı). Testte
    // zamanlayıcılar zaten kapalı; bağlantı tutulmaz.
    if (!this.settings.enabled) {
      this.leader = true;
      return;
    }
    if (this.config.env.nodeEnv === 'test') return;
    this.loop(0);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer !== null) clearTimeout(this.timer);
    await this.release();
  }

  isLeader(): boolean {
    return this.leader;
  }

  /** Zamanlanmış turun kapısı: lider değilse işi koşmaz, `null` döner. */
  async runIfLeader<T>(work: () => Promise<T>): Promise<T | null> {
    if (!this.leader) return null;
    return work();
  }

  /** Kilidi almayı bir kez dener. Zaten liderse yoklar. */
  async tryAcquire(): Promise<boolean> {
    if (this.client !== null) return this.checkHeartbeat();
    let client: PoolClient | null = null;
    try {
      client = await this.pool.connect();
      const result = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1::bigint) AS locked',
        [this.settings.lockKey],
      );
      if (result.rows[0]?.locked === true) {
        this.client = client;
        // Bağlantı hatası (sunucu oturumu kapattı) → liderlik düşer.
        client.on('error', (error: Error) => {
          this.logger.warn(`Lider bağlantısı koptu: ${error.message}`);
          void this.release(true);
        });
        this.setLeader(true);
        return true;
      }
      client.release();
      return false;
    } catch (error) {
      client?.release(true);
      this.logger.warn(
        `Lider kilidi denenemedi: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /** Lider bağlantısı hâlâ canlı mı ve kilit hâlâ bu oturumda mı. */
  async checkHeartbeat(): Promise<boolean> {
    const client = this.client;
    if (client === null) return false;
    try {
      const result = await client.query<{ held: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_locks
            WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted
              AND ((classid::bigint << 32) | objid::bigint) = $1::bigint
         ) AS held`,
        [this.settings.lockKey],
      );
      if (result.rows[0]?.held === true) return true;
      await this.release(true);
      return false;
    } catch {
      await this.release(true);
      return false;
    }
  }

  /** Kilidi bırakır (kapanışta) ya da bozuk bağlantıyı havuzdan atar. */
  async release(broken = false): Promise<void> {
    const client = this.client;
    this.client = null;
    if (this.settings.enabled) this.setLeader(false);
    if (client === null) return;
    if (!broken) {
      try {
        await client.query('SELECT pg_advisory_unlock($1::bigint)', [this.settings.lockKey]);
      } catch {
        broken = true;
      }
    }
    client.release(broken);
  }

  private setLeader(next: boolean): void {
    if (next === this.leader) return;
    this.leader = next;
    this.logger.log(
      next ? 'Bu örnek zamanlayıcı LİDERİ oldu.' : 'Bu örnek zamanlayıcı liderliğini bıraktı.',
    );
  }

  private loop(delayMs: number): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tryAcquire().finally(() => {
        if (this.stopped) return;
        const seconds = this.leader ? this.settings.heartbeatSeconds : this.settings.retrySeconds;
        this.loop(seconds * MS_PER_SECOND);
      });
    }, delayMs);
    this.timer.unref?.();
  }
}

/** Tek örnek: bütün zamanlayıcılar AYNI lider durumunu paylaşır. */
@Global()
@Module({ providers: [SchedulerLeaderService], exports: [SchedulerLeaderService] })
export class SchedulerLeaderModule {}
