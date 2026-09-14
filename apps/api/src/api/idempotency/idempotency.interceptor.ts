import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import type { Pool } from 'pg';
import type { Observable } from 'rxjs';
import { of } from 'rxjs';
import { mergeMap, tap } from 'rxjs/operators';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { PG_POOL } from '../../infrastructure/database/database.module';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { IdempotencyKeyInProgressError, IdempotencyKeyRequiredError } from './idempotency.errors';

/**
 * FAZ 1 wiring, dokuzuncu dilim — brief §54, docs/SECURITY.md §4:
 * Idempotency anahtarı ile yinelenen istekleri engeller.
 *
 * AUDIT_REPORT.md Bulgu E3 (bu oturum):
 * Satın alma işleminde alıcılar arası çapraz veri sızıntısını önlemek için
 * scopeId hesaplamasında buyerId öncelikli olarak değerlendirilir.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  private resolveScopeId(request: Request): string {
    // E3 DÜZELTMESİ: Eğer body'de buyerId varsa (market satın alma),
    // kapsamı buyerId (veya buyerId:listingId) yaparak farklı alıcıların
    // aynı anahtarla birbirlerinin verisine erişmesini engelle.
    const body = request.body as { buyerId?: unknown } | undefined;
    if (body && typeof body.buyerId === 'string' && body.buyerId.length > 0) {
      return body.buyerId;
    }

    return request.params?.id ?? 'global';
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();
    const idempotencyKey = request.header('Idempotency-Key');

    if (!idempotencyKey) {
      throw new IdempotencyKeyRequiredError();
    }

    const scopeId = this.resolveScopeId(request);
    const redisKey = `idempotency:${scopeId}:${idempotencyKey}`;

    const cached = await this.redis.get(redisKey);
    if (cached !== null) {
      return of(JSON.parse(cached));
    }

    // PostgreSQL: kalıcı kaynağa da bak
    const existing = await this.pool.query<{ status: string; response_body: unknown }>(
      'SELECT status, response_body FROM idempotency_keys WHERE scope_id = $1 AND idempotency_key = $2',
      [scopeId, idempotencyKey],
    );
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (row.status === 'completed') {
        void this.redis
          .set(redisKey, JSON.stringify(row.response_body), 'EX', this.config.env.idempotencyKeyTtlSeconds)
          .catch(() => undefined);
        return of(row.response_body);
      }
      // status === 'pending'
      throw new IdempotencyKeyInProgressError();
    }

    // Rezervasyon
    const reserved = await this.pool.query(
      "INSERT INTO idempotency_keys (scope_id, idempotency_key, status) VALUES ($1, $2, 'pending') ON CONFLICT DO NOTHING RETURNING scope_id",
      [scopeId, idempotencyKey],
    );
    if ((reserved.rowCount ?? 0) === 0) {
      throw new IdempotencyKeyInProgressError();
    }

    return next.handle().pipe(
      mergeMap(async (responseBody: unknown) => {
        await this.pool
          .query(
            "UPDATE idempotency_keys SET status = 'completed', response_body = $3, completed_at = now() WHERE scope_id = $1 AND idempotency_key = $2",
            [scopeId, idempotencyKey, JSON.stringify(responseBody)],
          )
          .catch(() => undefined);
        await this.redis
          .set(redisKey, JSON.stringify(responseBody), 'EX', this.config.env.idempotencyKeyTtlSeconds)
          .catch(() => undefined);
        return responseBody;
      }),
      tap({
        error: () => {
          void this.pool
            .query('DELETE FROM idempotency_keys WHERE scope_id = $1 AND idempotency_key = $2 AND status = $3', [
              scopeId,
              idempotencyKey,
              'pending',
            ])
            .catch(() => undefined);
        },
      }),
    );
  }
}