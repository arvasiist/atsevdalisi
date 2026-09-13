import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { of } from 'rxjs';
import { tap } from 'rxjs/operators';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { IdempotencyKeyRequiredError } from './idempotency.errors';

/**
 * FAZ 1 wiring, dokuzuncu dilim — brief §54, docs/SECURITY.md §4:
 * "Ödül/ödeme/mülkiyet değiştiren tüm endpoint'ler `Idempotency-Key`
 * header'ı zorunlu kılar [...] Aynı anahtarla gelen ikinci istek, işlemi
 * tekrar çalıştırmadan ilk sonucu döner." Bu, `RedisModule`'ün (FAZ 0'dan
 * beri hazır ama hiç `AppModule`'e bağlanmamıştı) İLK gerçek kullanıcısıdır
 * — bkz. `app.module.ts` doc yorumu.
 *
 * Belirli bir route'a `@UseInterceptors(IdempotencyInterceptor)` ile
 * uygulanır (global DEĞİL — her endpoint'in idempotency GEREKTİRİP
 * gerektirmediğine kendi controller'ı karar verir, `ValidationPipe`'ın
 * global DEĞİL de her route'un kendi DTO'suna bağlı olmasıyla AYNI
 * felsefe).
 *
 * ANAHTAR FORMATI — docs/SECURITY.md §4 tam olarak `idempotency:{playerId}:{key}`
 * der, ama BU interceptor genel amaçlıdır (gelecekte `/players/{id}/...`
 * gibi rotalarda da kullanılabilir) — bu yüzden `{playerId}` yerine
 * `req.params.id` (URL'deki BİRİNCİL kaynak kimliği) kullanılır. Oyuncu
 * kaynaklarında (`/players/{id}/...`) bu zaten `playerId`'nin AYNISIDIR;
 * ata-sahipli kaynaklarda (`/horses/{id}/practice-race`) bu `horseId`'dir
 * — bir at yalnızca TEK bir oyuncuya ait olduğundan, replay çakışmasını
 * önlemek için `playerId` kadar yeterlidir (aslında daha İNCE taneli).
 * `req.params.id` yoksa (ör. ileride gövde tabanlı bir kaynak) `'global'`
 * kullanılır.
 *
 * BİLİNÇLİ SINIRLAMA (bu dilim): yalnızca BAŞARILI (2xx) yanıtlar
 * önbelleğe alınır — bir domain hatası (ör. `InsufficientFundsError`)
 * önbelleğe ALINMAZ, böylece istemci sorunu düzeltip AYNI anahtarla
 * tekrar deneyebilir (bu, tipik Idempotency-Key semantiğidir — ör.
 * Stripe'ın kendi API'si de aynı şekilde davranır). AYRICA: tam bir
 * dağıtık kilit (aynı anahtarla GERÇEKTEN eşzamanlı iki isteğin ikisinin
 * de handler'ı çalıştırmasını önleyen bir `SETNX`) YOKTUR — bu, nadir
 * görülen bir yarış durumudur (aynı anahtarla iki isteğin milisaniyeler
 * içinde çakışması) ve ayrı bir sertleştirme dilimini hak eder; bkz.
 * docs/ROADMAP.md "FAZ 1 wiring — Dokuzuncu dilim".
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();
    const idempotencyKey = request.header('Idempotency-Key');

    if (!idempotencyKey) {
      throw new IdempotencyKeyRequiredError();
    }

    const scopeId = request.params?.id ?? 'global';
    const redisKey = `idempotency:${scopeId}:${idempotencyKey}`;

    const cached = await this.redis.get(redisKey);
    if (cached !== null) {
      return of(JSON.parse(cached));
    }

    return next.handle().pipe(
      tap((responseBody: unknown) => {
        // Ateşle-unut (fire-and-forget): önbelleğe yazma başarısız olsa
        // bile GERÇEK işlem zaten tamamlanmıştır — kullanıcıya hata
        // döndürmenin bir anlamı yok, sadece bir sonraki replay koruması
        // eksik kalır (bkz. yukarıdaki BİLİNÇLİ SINIRLAMA notu).
        void this.redis
          .set(redisKey, JSON.stringify(responseBody), 'EX', this.config.env.idempotencyKeyTtlSeconds)
          .catch(() => undefined);
      }),
    );
  }
}
