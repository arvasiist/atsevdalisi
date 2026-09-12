import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/api/middleware/http-exception.filter';

/**
 * FAZ 1 wiring — brief §7 Player, ilk uçtan uca (gerçek PostgreSQL'e karşı)
 * dilim. `main.ts`'teki bootstrap ayarlarının (prefix, ValidationPipe,
 * exception filter) AYNISI burada elle kurulur çünkü `main.ts`'in kendisi
 * bir HTTP sunucusu BAŞLATIR (`app.listen`) — testte onun yerine
 * `Test.createTestingModule` + `supertest` kullanılır (bkz. `health.e2e-spec.ts`
 * ile aynı desen).
 *
 * ÖNEMLİ — bu test GERÇEK bir PostgreSQL bağlantısı gerektirir
 * (`DATABASE_URL` ortam değişkeni, şeması `npm run migrate` ile
 * uygulanmış olmalı). Bu, bu geliştirme ortamında ÇALIŞTIRILAMAZ (ne `pg`
 * ne `@nestjs/testing` kurulu, bkz. docs/ARCHITECTURE.md §9); gerçek
 * doğrulama GitHub Actions CI'da yapılır (bkz. `.github/workflows/ci.yml`
 * "postgres" servisi).
 */
describe('Player (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function uniqueUsername(): string {
    // class-validator kuralı: yalnızca [a-z0-9_]. randomUUID() tire (-) içerir, kaldırılır.
    return `test_${randomUUID().replace(/-/g, '')}`.slice(0, 20);
  }

  it('/api/v1/players (POST) geçerli bir kayıtla başlangıç bakiyesine sahip yeni bir oyuncu döner', async () => {
    const username = uniqueUsername();
    const response = await request(app.getHttpServer())
      .post('/api/v1/players')
      .send({ username, displayName: 'Test Oyuncu' });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.level).toBe(1);
    expect(response.body.data.xp).toBe(0);
    expect(typeof response.body.data.money).toBe('number');
    expect(response.body.data.money).toBeGreaterThan(0);
    expect(response.body.data.id).toBeDefined();
  });

  it('/api/v1/players (POST) aynı kullanıcı adıyla ikinci kayıt denemesi 409 döner', async () => {
    const username = uniqueUsername();
    await request(app.getHttpServer()).post('/api/v1/players').send({ username, displayName: 'İlk' }).expect(201);

    const second = await request(app.getHttpServer())
      .post('/api/v1/players')
      .send({ username, displayName: 'İkinci' });

    expect(second.status).toBe(409);
    expect(second.body.success).toBe(false);
    expect(second.body.error.code).toBe('USERNAME_ALREADY_TAKEN');
  });

  it('/api/v1/players (POST) geçersiz formatlı kullanıcı adı 400 döner', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/players')
      .send({ username: 'AB', displayName: 'Test' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('/api/v1/players/:id (GET) az önce oluşturulan oyuncuyu döner', async () => {
    const username = uniqueUsername();
    const created = await request(app.getHttpServer())
      .post('/api/v1/players')
      .send({ username, displayName: 'Getirilecek Oyuncu' });

    const fetched = await request(app.getHttpServer()).get(`/api/v1/players/${created.body.data.id}`);

    expect(fetched.status).toBe(200);
    expect(fetched.body.data.id).toBe(created.body.data.id);
    expect(fetched.body.data.displayName).toBe('Getirilecek Oyuncu');
  });

  it('/api/v1/players/:id (GET) var olmayan bir id için 404 döner', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/players/${randomUUID()}`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('PLAYER_NOT_FOUND');
  });

  it('/api/v1/players/:id (GET) geçersiz (UUID olmayan) bir id için 400 döner', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/players/not-a-uuid');
    expect(response.status).toBe(400);
  });
});
