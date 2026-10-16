import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import type Redis from 'ioredis';
import type { Pool } from 'pg';
import { loadOpsConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../infrastructure/database/database.module';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { Public } from '../auth/public.decorator';

interface HealthResponse {
  status: 'ok';
  timestamp: string;
  service: 'at-sevdalisi-api';
}

type CheckState = 'ok' | 'error';

export interface ReadinessResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  checks: { database: CheckState; redis: CheckState };
}

/** Söz verilen sürede bitmezse reddeder — asılı bir bağlantı probu kilitlemesin. */
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
 * Sağlık kontrolü. `@Public()`: deploy/monitoring probu JWT taşımaz.
 *
 * - `GET /health` — CANLILIK (liveness): süreç yanıt veriyor mu. Bağımlılık
 *   sorgulamaz; aksi hâlde veritabanı kesintisi orkestratöre süreci
 *   öldürtür ve sorun büyür.
 * - `GET /health/ready` — HAZIRLIK (readiness, 02.10.2026 Faz 13-A):
 *   PostgreSQL (`SELECT 1`) ve Redis (`PING`) zaman aşımıyla denetlenir;
 *   biri düşükse 503. Hata AYRINTISI yanıta konmaz (iç adres/sürüm
 *   sızdırmaz) — yalnızca `ok`/`error`.
 */
@Controller('health')
export class HealthController {
  private readonly timeoutMs = loadOpsConfig().readiness.checkTimeoutMs;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'at-sevdalisi-api',
    };
  }

  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessResponse> {
    const [database, redis] = await Promise.all([
      this.probe(() => this.pool.query('SELECT 1')),
      this.probe(() => this.redis.ping()),
    ]);
    const healthy = database === 'ok' && redis === 'ok';
    res.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: healthy ? 'ok' : 'degraded', timestamp: new Date().toISOString(), checks: { database, redis } };
  }

  private async probe(run: () => Promise<unknown>): Promise<CheckState> {
    try {
      await withTimeout(run(), this.timeoutMs);
      return 'ok';
    } catch {
      return 'error';
    }
  }
}
