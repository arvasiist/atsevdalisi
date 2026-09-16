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
 * AUDIT_AND_HARDENING Öncelik 3 (bu oturum) — "Sadece Redis'te 24 saat"
 * yeterli DEĞİLDİR: proje sahibinin talebi PostgreSQL'de KALICI bir kayıt
 * ve GERÇEK bir eşzamanlılık koruması (dokuzuncu dilimin kendi "dağıtık
 * kilit yok" notunda kabul edilen riski KAPATMAK). Yeni akış — Redis
 * HIZLI ön-kontrol, PostgreSQL (`idempotency_keys`, migration 0020)
 * KALICI/authoritative kaynak (AUDIT_AND_HARDENING Öncelik 7'nin "Redis
 * sadece cache, Postgres her zaman authoritative" ilkesiyle BİREBİR
 * aynı):
 *
 *  1. Redis'te anahtar var mı? Varsa (sıcak/yakın zamanlı bir replay)
 *     doğrudan onu dön — ekstra bir DB sorgusuna GEREK yok.
 *  2. Yoksa PostgreSQL'de `INSERT ... ON CONFLICT DO NOTHING` ile
 *     `status: 'pending'` bir satır REZERVE ETMEYE çalışılır. Bu, AYNI
 *     anahtarla GERÇEKTEN eşzamanlı iki isteğin İKİSİNİN DE işleyiciyi
 *     çalıştırmasını `(scope_id, idempotency_key)` PRIMARY KEY'i
 *     üzerinden veritabanı seviyesinde ENGELLER.
 *  3. Rezervasyon BAŞARISIZ olursa (satır zaten var): `status = 'completed'`
 *     ise saklı yanıtı dön (ve Redis'i ısıt); `status = 'pending'` ise
 *     (gerçekten eşzamanlı bir çakışma) `IdempotencyKeyInProgressError`
 *     (409) fırlatılır — işleyici HİÇ ÇALIŞTIRILMAZ.
 *  4. Rezervasyon BAŞARILI olursa işleyici çalışır; BAŞARILI (2xx) yanıt
 *     hem PostgreSQL'e (`status: 'completed'`, kalıcı, TTL'siz) hem
 *     Redis'e (hızlı ön-kontrol için, TTL'li) yazılır. BAŞARISIZ (domain
 *     hatası) durumda PostgreSQL'deki `pending` satır SİLİNİR — önceki
 *     davranışla AYNI: istemci sorunu düzeltip AYNI anahtarla tekrar
 *     deneyebilir (bkz. altta "BİLİNÇLİ SINIRLAMA").
 *
 * BİLİNÇLİ SINIRLAMA (devam ediyor): yalnızca BAŞARILI (2xx) yanıtlar
 * kalıcı olarak saklanır — bir domain hatası (ör. `InsufficientFundsError`)
 * SAKLANMAZ, böylece istemci sorunu düzeltip AYNI anahtarla tekrar
 * deneyebilir (tipik Idempotency-Key semantiği, ör. Stripe'ın kendi
 * API'si de aynı şekilde davranır).
 *
 * DÜZELTME (bu oturum, AUDIT_REPORT.md remediation sırasında CI'ın
 * yakaladığı ayrı bir regresyon) — kalıcı `completed` yazısı ÖNCEDEN
 * `void this.pool.query(...)` ile GERÇEKTEN "ateşle-unut" (awaited
 * DEĞİL) yapılıyordu: yanıt istemciye, bu yazma tamamlanmadan ÖNCE
 * gönderiliyordu. Bu, TEK bir isteğin kendi replay'i için sorun
 * DEĞİLDİR (Redis ısındıktan sonra okunur) — ama `market.e2e-spec.ts`
 * "AYNI Idempotency-Key ile GERÇEKTEN eşzamanlı iki istekten..." testinin
 * yaptığı gibi, yanıt alınır alınmaz `idempotency_keys` tablosunu
 * DOĞRUDAN sorgulayan bir istemci için gerçek bir yarış durumuydu:
 * satır bazen hâlâ `pending` görünüyordu. Düzeltme: yazma işlemleri artık
 * `mergeMap` içinde AWAIT ediliyor — yanıt, kalıcı kayıt GERÇEKTEN
 * `completed` olana kadar istemciye gönderilmiyor. Yazma başarısız
 * olursa (`.catch(() => undefined)`), yukarıdaki BİLİNÇLİ SINIRLAMA
 * ilkesiyle AYNI şekilde sessizce yutulur — GERÇEK işlem zaten
 * tamamlandığından istemciye hata döndürülmez, yalnızca bir sonraki
 * replay koruması eksik kalabilir.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(PG_POOL) private readonly pool: Pool,
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

    // PostgreSQL: kalıcı kaynağa da bak (Redis TTL'i dolmuş ama kalıcı
    // kayıt hâlâ duruyor olabilir) — ısıtılmış Redis önbelleği bir sonraki
    // isteği hızlandırır.
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
      // `status === 'pending'` — gerçekten eşzamanlı bir çakışma.
      throw new IdempotencyKeyInProgressError();
    }

    // Rezervasyon — `(scope_id, idempotency_key)` PRIMARY KEY'i, AYNI
    // anahtarla eşzamanlı bir başka isteğin bu INSERT'i "kazanmasını"
    // engeller.
    const reserved = await this.pool.query(
      "INSERT INTO idempotency_keys (scope_id, idempotency_key, status) VALUES ($1, $2, 'pending') ON CONFLICT DO NOTHING RETURNING scope_id",
      [scopeId, idempotencyKey],
    );
    if ((reserved.rowCount ?? 0) === 0) {
      // Bu isteğin kendi `SELECT`'i (yukarıda) ile bu `INSERT` arasındaki
      // dar aralıkta başka bir istek rezervasyonu kazandı — AYNI
      // sonuçtur (409), tekrar okumaya gerek yok (o istek hâlâ işleniyor
      // olmalı).
      throw new IdempotencyKeyInProgressError();
    }

    return next.handle().pipe(
      // Yazma başarısız olsa bile GERÇEK işlem zaten tamamlanmıştır —
      // istemciye hata döndürmenin bir anlamı yok (`.catch(() => undefined)`,
      // bkz. yukarıdaki BİLİNÇLİ SINIRLAMA notu). Ama yanıt istemciye
      // gönderilmeden ÖNCE bu yazmanın GERÇEKTEN tamamlanmış olması
      // gerekiyor — bkz. dosyanın üstündeki "DÜZELTME (bu oturum)" notu.
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
      // İşleyici bir domain hatasıyla REDDEDİLİRSE (`InsufficientFundsError`
      // vb.), `tap`'in `next` dalı hiç ÇALIŞMAZ — bu yüzden ayrı bir
      // rxjs operatörüyle (`catchError` yerine burada basitçe bir
      // `finalize` benzeri temizlik) `pending` satır SİLİNİR, böylece
      // istemci sorunu düzeltip AYNI anahtarla tekrar deneyebilir. rxjs
      // `tap`'in `error` callback'i tam bunun için kullanılır.
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
