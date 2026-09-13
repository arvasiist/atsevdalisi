import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/api/middleware/http-exception.filter';

/**
 * FAZ 1 wiring — İkinci dilim: `RegisterPlayerUseCase` artık yeni oyuncuya
 * bir başlangıç atı da veriyor (bkz. `domain/horse/horse.ts`
 * `createStarterHorse`, docs/ROADMAP.md). Bu dosya, `player.e2e-spec.ts`
 * ile AYNI bootstrap desenini kullanır ve AYNI şekilde GERÇEK bir
 * PostgreSQL bağlantısı gerektirir (bu ortamda ÇALIŞTIRILAMAZ, bkz.
 * docs/ARCHITECTURE.md §9 — yalnızca CI'da doğrulanır).
 *
 * ÖNEMLİ (bkz. docs/ARCHITECTURE.md §9.1 Hata 6): `describe`/`it`/`expect`/
 * `beforeAll`/`afterAll` burada AÇIKÇA `vitest`'ten içe aktarılıyor —
 * `health.e2e-spec.ts`/`player.e2e-spec.ts`'te bulunan gizli hatayı BAŞTAN
 * önlemek için.
 */
describe('Horse (e2e)', () => {
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
    return `test_${randomUUID().replace(/-/g, '')}`.slice(0, 20);
  }

  async function registerPlayer(): Promise<{ id: string }> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/players')
      .send({ username: uniqueUsername(), displayName: 'At Sahibi' })
      .expect(201);
    return response.body.data;
  }

  it('/api/v1/players (POST) — yeni oyuncu otomatik olarak bir başlangıç atı alır', async () => {
    const player = await registerPlayer();

    const response = await request(app.getHttpServer()).get(`/api/v1/horses?ownerId=${player.id}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    const horse = response.body.data[0];
    expect(horse.ownerId).toBe(player.id);
    expect(horse.level).toBe(1);
    expect(horse.status).toBe('active');
    expect(horse.gender).toBe('gelding');
    expect(horse.health).toBe(100);
    // AUDIT_AND_HARDENING Öncelik 5 (bu oturum) — docs/SECURITY.md §9,
    // bkz. `apps/api/src/api/dto/horse.mapper.ts`. Ham `potential` HİÇBİR
    // ZAMAN HTTP yanıtına sızmamalı, yerine bir `potentialEstimate` ARALIĞI
    // dönmelidir.
    expect(horse).not.toHaveProperty('potential');
    expect(JSON.stringify(response.body)).not.toContain('"potential"');
    expect(horse.potentialEstimate).toBeDefined();
    expect(horse.potentialEstimate.min).toBeLessThanOrEqual(horse.potentialEstimate.max);
  });

  it('/api/v1/horses/:id (GET) az önce oluşturulan atı döner', async () => {
    const player = await registerPlayer();
    const listResponse = await request(app.getHttpServer())
      .get(`/api/v1/horses?ownerId=${player.id}`)
      .expect(200);
    const horseId = listResponse.body.data[0].id;

    const response = await request(app.getHttpServer()).get(`/api/v1/horses/${horseId}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(horseId);
    expect(response.body.data.ownerId).toBe(player.id);
    // AUDIT_AND_HARDENING Öncelik 5 (bu oturum) — `listByOwner` testindeki
    // AYNI gizlilik kontrolü, TEK BİR at detayı uç noktası için de geçerli.
    expect(response.body.data).not.toHaveProperty('potential');
    expect(JSON.stringify(response.body)).not.toContain('"potential"');
    expect(response.body.data.potentialEstimate).toBeDefined();
  });

  it('/api/v1/horses/:id (GET) var olmayan bir id için 404 döner', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/horses/${randomUUID()}`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('HORSE_NOT_FOUND');
  });

  it('/api/v1/horses/:id (GET) geçersiz (UUID olmayan) bir id için 400 döner', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/horses/not-a-uuid');
    expect(response.status).toBe(400);
  });

  it('/api/v1/horses (GET) ownerId eksikse 400 döner', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/horses');
    expect(response.status).toBe(400);
  });

  it('/api/v1/horses (GET) hiç atı olmayan (var olmayan) bir sahip için boş dizi döner', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/horses?ownerId=${randomUUID()}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });
});
