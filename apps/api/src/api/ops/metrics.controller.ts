import { createHash, timingSafeEqual } from 'node:crypto';
import { Controller, Get, Headers, HttpStatus, Inject, NotFoundException, Res, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { loadOpsConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../infrastructure/database/database.module';
import { metrics, type GaugeSample } from '../../infrastructure/ops/metrics';
import { Public } from '../auth/public.decorator';

const BYTES_PER_KILOBYTE = 1024;
const BYTES_PER_MEGABYTE = BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE;

function sameSecret(given: string, expected: string): boolean {
  // Uzunluk sızdırmasın diye özetler karşılaştırılır.
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('zaman aşımı')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * `GET /metrics` (08.10.2026) — Prometheus metin biçimi. Oturum kapısı
 * dışındadır (`@Public`) ama YALNIZCA `METRICS_TOKEN` ile açılır:
 * değişken yoksa uç YOK sayılır (404), yanlış token 401. Yanıtta oyuncu
 * kimliği, bakiye ya da kişisel veri YOK — yalnızca sayımlar.
 */
@Controller('metrics')
export class MetricsController {
  private readonly config = loadOpsConfig().metrics;

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Public()
  @Get()
  async scrape(@Headers('authorization') authorization: string | undefined, @Res() response: Response): Promise<void> {
    const expected = process.env.METRICS_TOKEN?.trim();
    if (!expected) throw new NotFoundException();
    const given = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
    if (!given || !sameSecret(given, expected)) throw new UnauthorizedException('Geçersiz metrik token\'ı.');

    response
      .status(HttpStatus.OK)
      .type('text/plain; version=0.0.4; charset=utf-8')
      .send(metrics.render([...this.processGauges(), ...this.poolGauges(), ...(await this.gameGauges())]));
  }

  private processGauges(): GaugeSample[] {
    const memory = process.memoryUsage();
    return [
      { name: 'process_uptime_seconds', help: 'Süreç çalışma süresi (saniye).', value: Math.round(process.uptime()) },
      { name: 'process_resident_memory_megabytes', help: 'RSS bellek (MB).', value: Math.round(memory.rss / BYTES_PER_MEGABYTE) },
      { name: 'process_heap_used_megabytes', help: 'Kullanılan heap (MB).', value: Math.round(memory.heapUsed / BYTES_PER_MEGABYTE) },
    ];
  }

  private poolGauges(): GaugeSample[] {
    return [
      { name: 'db_pool_connections', help: 'Postgres havuzu bağlantıları.', value: this.pool.totalCount, labels: { state: 'total' } },
      { name: 'db_pool_connections', help: 'Postgres havuzu bağlantıları.', value: this.pool.idleCount, labels: { state: 'idle' } },
      { name: 'db_pool_connections', help: 'Postgres havuzu bağlantıları.', value: this.pool.waitingCount, labels: { state: 'waiting' } },
    ];
  }

  private async gameGauges(): Promise<GaugeSample[]> {
    try {
      const result = await withTimeout(
        this.pool.query<{ players: string; open_races: string; active_listings: string; pending_payments: string }>(
          `SELECT
             (SELECT COUNT(*) FROM players WHERE deleted_at IS NULL) AS players,
             (SELECT COUNT(*) FROM races WHERE status IN ('scheduled', 'locking')) AS open_races,
             (SELECT COUNT(*) FROM market_listings WHERE status = 'active') AS active_listings,
             (SELECT COUNT(*) FROM payment_orders WHERE status IN ('created', 'pending')) AS pending_payments`,
        ),
        this.config.gaugeQueryTimeoutMs,
      );
      const row = result.rows[0];
      return [
        { name: 'game_gauge_query_up', help: 'Oyun göstergeleri sorgusu başarılı mı (1/0).', value: 1 },
        { name: 'game_players', help: 'Silinmemiş oyuncu sayısı.', value: Number(row?.players ?? 0) },
        { name: 'game_open_races', help: 'Açık lobi yarışı (scheduled + locking).', value: Number(row?.open_races ?? 0) },
        { name: 'game_active_listings', help: 'Aktif pazar ilanı.', value: Number(row?.active_listings ?? 0) },
        { name: 'game_pending_payments', help: 'Sonuçlanmamış ödeme siparişi.', value: Number(row?.pending_payments ?? 0) },
      ];
    } catch {
      return [{ name: 'game_gauge_query_up', help: 'Oyun göstergeleri sorgusu başarılı mı (1/0).', value: 0 }];
    }
  }
}
