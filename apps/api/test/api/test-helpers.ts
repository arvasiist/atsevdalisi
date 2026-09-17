import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/api/middleware/http-exception.filter';

/**
 * AUDIT_REPORT.md Bulgu S1 (Critical) hardening (bu oturum) — brief §41/§50
 * Google/Apple Sign-In. Global `AuthGuard` artık `@Public()` işaretli
 * olmayan HER rotada geçerli bir `Authorization: Bearer <token>` header'ı
 * gerektirdiğinden, HER e2e test dosyasının kendi `beforeAll` bootstrap'ını
 * VE "yeni oyuncu kaydet" yardımcı fonksiyonunu tekrar tekrar YAZMASI
 * yerine (önceki desen — bkz. git geçmişindeki `player.e2e-spec.ts`/
 * `training.e2e-spec.ts`), bu TEK dosya paylaşılır. `main.ts`'teki
 * bootstrap ayarlarının (prefix, ValidationPipe, exception filter) AYNISI
 * burada kurulur (bkz. o dosyanın doc yorumu — `app.listen` yerine
 * `Test.createTestingModule` + `supertest`).
 */
export async function bootstrapTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}

/** class-validator kuralı: `username` yalnızca `[a-z0-9_]` içerebilir. `randomUUID()` tire (-) içerir, kaldırılır. */
export function uniqueUsername(prefix = 'test'): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`.slice(0, 20);
}

export interface RegisteredTestPlayer {
  playerId: string;
  token: string;
  /** `.set('Authorization', authHeader)` olarak doğrudan kullanıma hazır. */
  authHeader: string;
}

/**
 * `POST /players` ile yeni bir oyuncu (+ başlangıç atı, bkz.
 * `RegisterPlayerUseCase`) kaydeder ve dönen `AuthSession`'ı (bkz.
 * `packages/shared-types/src/player.ts`) test için hazır bir şekilde
 * döner. `POST /players` `@Public()` olduğundan bu çağrının kendisi bir
 * Authorization header'ı GEREKTİRMEZ — döndürdüğü token, SONRAKİ TÜM
 * korunan isteklerde kullanılır.
 */
export async function registerTestPlayer(
  app: INestApplication,
  displayName = 'Test Oyuncu',
): Promise<RegisteredTestPlayer> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/players')
    .send({ username: uniqueUsername(), displayName })
    .expect(201);
  const { token, player } = response.body.data as { token: string; player: { id: string } };
  return { playerId: player.id, token, authHeader: `Bearer ${token}` };
}

/**
 * `registerTestPlayer` + o oyuncunun (kayıtta OTOMATİK verilen) başlangıç
 * atının id'sini tek çağrıda döner — `training.e2e-spec.ts`'in ESKİ
 * `registerPlayerWithStarterHorse` yardımcısıyla AYNI amaç, ama artık
 * `GET /horses?ownerId=` çağrısı da (AuthGuard + self-check nedeniyle)
 * kimlik doğrulamalı yapılır.
 */
export async function registerTestPlayerWithStarterHorse(
  app: INestApplication,
  displayName = 'Test Oyuncu',
): Promise<RegisteredTestPlayer & { horseId: string }> {
  const player = await registerTestPlayer(app, displayName);
  const listResponse = await request(app.getHttpServer())
    .get(`/api/v1/horses?ownerId=${player.playerId}`)
    .set('Authorization', player.authHeader)
    .expect(200);
  return { ...player, horseId: listResponse.body.data[0].id };
}
