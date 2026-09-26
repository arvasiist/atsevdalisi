import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapTestApp, registerTestPlayer, registerTestPlayerWithStarterHorse } from './test-helpers';

/** `race.e2e-spec.ts`'in "varsayılan taktikle" testiyle AYNI istek şekli (boş gövde = varsayılan taktik) ve `Idempotency-Key` gereksinimi. */

/**
 * Ekipman (`claude/hizli-bitirme-plani.md`'nin proje sahibi tarafından
 * önceliklendirdiği "düşük riskli, karar gerektirmeyen" dilim) —
 * `training.e2e-spec.ts` ile AYNI bootstrap deseni ve AYNI kısıt (GERÇEK
 * PostgreSQL gerektirir, bu ortamda ÇALIŞTIRILAMAZ — bkz.
 * docs/ARCHITECTURE.md §9).
 *
 * Güvenlik testleri (401/403/404) `training.e2e-spec.ts`/`train`
 * uç noktasıyla AYNI `HorseOwnerGuardByParam` deseninde.
 */
describe('Equipment (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/horses/:id/equipment (GET) yeni bir at için boş dizi döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Ekipmansız');

    const response = await request(app.getHttpServer())
      .get(`/api/v1/horses/${horseId}/equipment`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(response.body.data).toEqual([]);
  });

  it('/api/v1/horses/:id/equipment (POST) geçerli bir ekipman parçası oluşturur — HER ZAMAN equipped: false başlar', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Ekipman Sahibi');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/equipment`)
      .set('Authorization', authHeader)
      .send({ equipmentType: 'saddle', name: 'Deri Eyer', quality: 80 })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.horseId).toBe(horseId);
    expect(response.body.data.equipmentType).toBe('saddle');
    expect(response.body.data.name).toBe('Deri Eyer');
    expect(response.body.data.quality).toBe(80);
    expect(response.body.data.equipped).toBe(false);
    expect(typeof response.body.data.id).toBe('string');
    expect(typeof response.body.data.createdAt).toBe('string');
  });

  it('/api/v1/horses/:id/equipment (POST) geçersiz bir ekipman tipi için 400 döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Geçersiz Tip');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/equipment`)
      .set('Authorization', authHeader)
      .send({ equipmentType: 'not-a-real-type', name: 'X', quality: 50 });

    expect(response.status).toBe(400);
  });

  it('/api/v1/horses/:id/equipment (POST) aralık dışı bir kalite için 400 döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Geçersiz Kalite');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/equipment`)
      .set('Authorization', authHeader)
      .send({ equipmentType: 'saddle', name: 'X', quality: 150 });

    expect(response.status).toBe(400);
  });

  it('/api/v1/horses/:id/equipment (POST) Authorization header olmadan 401 döner', async () => {
    const { horseId } = await registerTestPlayerWithStarterHorse(app, 'Yetkisiz Ekipman');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/equipment`)
      .send({ equipmentType: 'saddle', name: 'X', quality: 50 });

    expect(response.status).toBe(401);
  });

  it('/api/v1/horses/:id/equipment (POST) başkasının atına ekipman eklemeye çalışan istek 403 döner', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Gerçek Sahip');
    const attacker = await registerTestPlayer(app, 'Ekipman Saldırganı');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${owner.horseId}/equipment`)
      .set('Authorization', attacker.authHeader)
      .send({ equipmentType: 'saddle', name: 'X', quality: 50 });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('/api/v1/horses/:id/equipment (POST) var olmayan bir at için 404 döner', async () => {
    const someone = await registerTestPlayer(app, 'Ekipman İçin Herhangi Biri');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${randomUUID()}/equipment`)
      .set('Authorization', someone.authHeader)
      .send({ equipmentType: 'saddle', name: 'X', quality: 50 });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('HORSE_NOT_FOUND');
  });

  describe('kuşanma/çıkarma akışı', () => {
    it('bir parçayı kuşandırır ve GET listesinde equipped: true olarak görünür', async () => {
      const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Kuşanan');

      const created = await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/equipment`)
        .set('Authorization', authHeader)
        .send({ equipmentType: 'horseshoe', name: 'Çelik Nal', quality: 90 })
        .expect(201);
      const equipmentId = created.body.data.id;

      const equipResponse = await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/equipment/${equipmentId}/equip`)
        .set('Authorization', authHeader)
        .expect(200);
      expect(equipResponse.body.data.equipped).toBe(true);

      const listResponse = await request(app.getHttpServer())
        .get(`/api/v1/horses/${horseId}/equipment`)
        .set('Authorization', authHeader)
        .expect(200);
      expect(listResponse.body.data).toHaveLength(1);
      expect(listResponse.body.data[0].equipped).toBe(true);
    });

    it('AYNI tipten yeni bir parça kuşanıldığında ESKİSİ otomatik olarak çıkarılır (idx_horse_equipment_one_equipped_per_type)', async () => {
      const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yer Değiştiren');

      const first = await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/equipment`)
        .set('Authorization', authHeader)
        .send({ equipmentType: 'bridle', name: 'Eski Dizgin', quality: 40 })
        .expect(201);
      const second = await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/equipment`)
        .set('Authorization', authHeader)
        .send({ equipmentType: 'bridle', name: 'Yeni Dizgin', quality: 95 })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/equipment/${first.body.data.id}/equip`)
        .set('Authorization', authHeader)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/equipment/${second.body.data.id}/equip`)
        .set('Authorization', authHeader)
        .expect(200);

      const listResponse = await request(app.getHttpServer())
        .get(`/api/v1/horses/${horseId}/equipment`)
        .set('Authorization', authHeader)
        .expect(200);

      const firstRow = listResponse.body.data.find((item: { id: string }) => item.id === first.body.data.id);
      const secondRow = listResponse.body.data.find((item: { id: string }) => item.id === second.body.data.id);
      expect(firstRow.equipped).toBe(false);
      expect(secondRow.equipped).toBe(true);
    });

    it('bir parçayı çıkarır', async () => {
      const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Çıkaran');

      const created = await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/equipment`)
        .set('Authorization', authHeader)
        .send({ equipmentType: 'blinkers', name: 'Göz Siperi', quality: 60 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/equipment/${created.body.data.id}/equip`)
        .set('Authorization', authHeader)
        .expect(200);

      const unequipResponse = await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/equipment/${created.body.data.id}/unequip`)
        .set('Authorization', authHeader)
        .expect(200);

      expect(unequipResponse.body.data.equipped).toBe(false);
    });

    it('başka bir ata ait bir equipmentId ile kuşandırmaya çalışan istek 404 döner', async () => {
      const owner = await registerTestPlayerWithStarterHorse(app, 'Ekipman Sahibi İki');
      const other = await registerTestPlayerWithStarterHorse(app, 'Diğer At Sahibi');

      const created = await request(app.getHttpServer())
        .post(`/api/v1/horses/${owner.horseId}/equipment`)
        .set('Authorization', owner.authHeader)
        .send({ equipmentType: 'leg_wraps', name: 'Bandaj', quality: 70 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/horses/${other.horseId}/equipment/${created.body.data.id}/equip`)
        .set('Authorization', other.authHeader);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('HORSE_EQUIPMENT_NOT_FOUND');
    });

    it('var olmayan bir equipmentId ile çıkarmaya çalışan istek 404 döner', async () => {
      const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Var Olmayan Ekipman');

      const response = await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/equipment/${randomUUID()}/unequip`)
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('HORSE_EQUIPMENT_NOT_FOUND');
    });
  });

  it('/api/v1/horses/:id/practice-race (POST) kuşanılmış ekipmanla çalışmaya devam eder (Race Engine kırılmaz)', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Ekipmanlı Yarışçı');

    const created = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/equipment`)
      .set('Authorization', authHeader)
      .send({ equipmentType: 'saddle', name: 'Yarış Eyeri', quality: 100 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/equipment/${created.body.data.id}/equip`)
      .set('Authorization', authHeader)
      .expect(200);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.horseId).toBe(horseId);
  });
});
