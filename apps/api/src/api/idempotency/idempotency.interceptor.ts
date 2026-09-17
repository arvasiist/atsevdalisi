import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Pool } from 'pg';
import type { Observable } from 'rxjs';
import { of } from 'rxjs';
import { mergeMap, tap } from 'rxjs/operators';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { PG_POOL } from '../../infrastructure/database/database.module';
import { AppConfigService } from '../../infrastructure/config/config.service';
import type { AuthenticatedRequest } from '../auth/current-player.decorator';
import { IdempotencyKeyInProgressError, IdempotencyKeyRequiredError } from './idempotency.errors';
import { IDEMPOTENCY_SCOPE_KEY, type IdempotencyScopeSource } from './idempotency-scope.decorator';

/**
 * FAZ 1 wiring, dokuzuncu dilim — brief §54, docs/SECURITY.md §4:
 * Idempotency anahtarı ile yinelenen istekleri engeller.
 *
 * AUDIT_REPORT.md Bulgu E3 (bu oturum, ORİJİNAL düzeltme): Satın alma
 * işleminde alıcılar arası çapraz veri sızıntısını önlemek için scopeId
 * hesaplaması `body.buyerId`'ye göre yapılıyordu.
 *
 * AUDIT_REPORT.md Bulgu S1/S2/S4 hardening (bu oturum, GÜNCELLEME):
 * `buyerId` artık body'de HİÇ GÖNDERİLMEZ (client-supplied kimliğe
 * güvenmenin KENDİSİ bir IDOR riskiydi, bkz. `market.controller.ts`
 * `buyListing`) — bu yüzden E3'ün "alıcıya göre kapsam" gerekçesi
 * `@IdempotencyScope('player')` ile `request.player.id`'ye (AuthGuard'ın
 * doğruladığı kimlik) taşındı. DİĞER TÜM rotalar (train/care/feed/
 * practice-race/stable-upgrade/daily-reward) `IdempotencyScope` hiç
 * KULLANMADIĞINDAN varsayılan `'param'` davranışını (yani `req.params.id`)
 * DEĞİŞMEDEN korur — bu BİLİNÇLİDİR: ör. `practice-race`'in kapsamı
 * halihazırda horseId'dir (playerId DEĞİL), bunu playerId'ye çevirmek aynı
 * oyuncunun İKİ FARKLI atı için aynı anda kullanılan bir Idempotency-Key
 * değerini yanlışlıkla ÇAKIŞTIRIP yanlış atın yarış sonucunu döndürebilirdi
 * — bu yüzden yalnızca GERÇEKTEN gerektiren tek rota (`buyListing`) için
 * açıkça işaretlenir, global bir davranış değişikliği YAPILMAZ.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  private resolveScopeId(context: ExecutionContext, request: AuthenticatedRequest): string {
    const scopeSource = this.reflector.getAllAndOverride<IdempotencyScopeSource>(IDEMPOTENCY_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (scopeSource === 'player' && request.player) {
      return request.player.id;
    }
    return request.params?.id ?? 'global';
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const idempotencyKey = request.header('Idempotency-Key');

    if (!idempotencyKey) {
      throw new IdempotencyKeyRequiredError();
    }

    const scopeId = this.resolveScopeId(context, request);
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