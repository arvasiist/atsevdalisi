import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEquipmentConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
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
  let pool: Pool;
  const catalog = loadEquipmentConfig().catalog;
  const item = (key: string) => catalog.find((candidate) => candidate.key === key)!;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  const money = async (playerId: string) =>
    Number((await pool.query('SELECT money FROM players WHERE id = $1', [playerId])).rows[0].money);

  /** Katalogdan alım (08.10.2026) — PARA YOLU, `Idempotency-Key` zorunlu. */
  const buy = (horseId: string, authHeader: string, catalogKey: string, key: string = randomUUID()) =>
    request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/equipment`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', key)
      .send({ catalogKey });

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

  it('katalogdan alım: kalite/ad/fiyat katalogdan, para düşer, defter satırı yazılır, equipped: false başlar', async () => {
    const { horseId, authHeader, playerId } = await registerTestPlayerWithStarterHorse(app, 'Ekipman Sahibi');
    const saddle = item('saddle-basic');
    const before = await money(playerId);

    const response = await buy(horseId, authHeader, saddle.key).expect(201);

    expect(response.body.data.price).toBe(saddle.priceMoney);
    expect(response.body.data.money).toBe(before - saddle.priceMoney);
    const bought = response.body.data.item;
    expect(bought).toMatchObject({
      horseId,
      equipmentType: saddle.equipmentType,
      name: saddle.name,
      quality: saddle.quality,
      equipped: false,
      catalogKey: saddle.key,
    });
    expect(await money(playerId)).toBe(before - saddle.priceMoney);
    const ledger = await pool.query(
      "SELECT amount, reference_id, balance_before, balance_after FROM economy_transactions WHERE player_id = $1 AND type = 'equipment_purchase'",
      [playerId],
    );
    expect(ledger.rows).toHaveLength(1);
    expect(Number(ledger.rows[0].amount)).toBe(-saddle.priceMoney);
    expect(ledger.rows[0].reference_id).toBe(bought.id);
    expect(Number(ledger.rows[0].balance_before) - Number(ledger.rows[0].balance_after)).toBe(saddle.priceMoney);
  });

  it('aynı Idempotency-Key ikinci parçayı ALMAZ; anahtarsız istek 400', async () => {
    const { horseId, authHeader, playerId } = await registerTestPlayerWithStarterHorse(app, 'Tekrar Basan');
    const key = randomUUID();
    const before = await money(playerId);
    const first = await buy(horseId, authHeader, 'bridle-basic', key).expect(201);
    const replay = await buy(horseId, authHeader, 'bridle-basic', key);
    expect(replay.body.data.item.id).toBe(first.body.data.item.id);
    expect(await money(playerId)).toBe(before - item('bridle-basic').priceMoney);
    await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/equipment`)
      .set('Authorization', authHeader)
      .send({ catalogKey: 'bridle-basic' })
      .expect(400);
  });

  it('istemci kalite seçemez: bilinmeyen/eksik katalog anahtarı 400, para düşmez', async () => {
    const { horseId, authHeader, playerId } = await registerTestPlayerWithStarterHorse(app, 'Geçersiz Kalem');
    const before = await money(playerId);
    const unknown = await buy(horseId, authHeader, 'altin-eyer').expect(400);
    expect(unknown.body.error.code).toBe('VALIDATION_ERROR');
    await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/equipment`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ equipmentType: 'saddle', name: 'Bedava Eyer', quality: 100 })
      .expect(400);
    expect(await money(playerId)).toBe(before);
  });

  it('seviye şartı 409 EQUIPMENT_LEVEL_LOCKED; yetersiz bakiye 409 INSUFFICIENT_FUNDS — parça yazılmaz', async () => {
    const { horseId, authHeader, playerId } = await registerTestPlayerWithStarterHorse(app, 'Kilitli Kalem');
    const race = item('saddle-race');
    const locked = await buy(horseId, authHeader, race.key).expect(409);
    expect(locked.body.error.code).toBe('EQUIPMENT_LEVEL_LOCKED');

    await pool.query('UPDATE players SET level = $2, money = $3 WHERE id = $1', [
      playerId,
      race.requiredLevel,
      race.priceMoney - 1,
    ]);
    const poor = await buy(horseId, authHeader, race.key).expect(409);
    expect(poor.body.error.code).toBe('INSUFFICIENT_FUNDS');
    const rows = await pool.query('SELECT COUNT(*) FROM horse_equipment WHERE horse_id = $1', [horseId]);
    expect(Number(rows.rows[0].count)).toBe(0);
    expect(await money(playerId)).toBe(race.priceMoney - 1);
  });

  it('/api/v1/horses/:id/equipment (POST) Authorization header olmadan 401 döner', async () => {
    const { horseId } = await registerTestPlayerWithStarterHorse(app, 'Yetkisiz Ekipman');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/equipment`)
      .set('Idempotency-Key', randomUUID())
      .send({ catalogKey: 'saddle-basic' });

    expect(response.status).toBe(401);
  });

  it('/api/v1/horses/:id/equipment (POST) başkasının atına ekipman eklemeye çalışan istek 403 döner', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Gerçek Sahip');
    const attacker = await registerTestPlayer(app, 'Ekipman Saldırganı');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${owner.horseId}/equipment`)
      .set('Authorization', attacker.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ catalogKey: 'saddle-basic' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('/api/v1/horses/:id/equipment (POST) var olmayan bir at için 404 döner', async () => {
    const someone = await registerTestPlayer(app, 'Ekipman İçin Herhangi Biri');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${randomUUID()}/equipment`)
      .set('Authorization', someone.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ catalogKey: 'saddle-basic' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('HORSE_NOT_FOUND');
  });

  describe('kuşanma/çıkarma akışı', () => {
    it('bir parçayı kuşandırır ve GET listesinde equipped: true olarak görünür', async () => {
      const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Kuşanan');

      const created = await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/equipment`)
        .set('Authorization', authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({ catalogKey: 'horseshoe-basic' })
        .expect(201);
      const equipmentId = created.body.data.item.id;

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
        .set('Idempotency-Key', randomUUID())
        .send({ catalogKey: 'bridle-basic' })
        .expect(201);
      const second = await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/equipment`)
        .set('Authorization', authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({ catalogKey: 'bridle-basic' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/equipment/${first.body.data.item.id}/equip`)
        .set('Authorization', authHeader)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/equipment/${second.body.data.item.id}/equip`)
        .set('Authorization', authHeader)
        .expect(200);

      const listResponse = await request(app.getHttpServer())
        .get(`/api/v1/horses/${horseId}/equipment`)
        .set('Authorization', authHeader)
        .expect(200);

      const firstRow = listResponse.body.data.find((item: { id: string }) => item.id === first.body.data.item.id);
      const secondRow = listResponse.body.data.find((item: { id: string }) => item.id === second.body.data.item.id);
      expect(firstRow.equipped).toBe(false);
      expect(secondRow.equipped).toBe(true);
    });

    it('bir parçayı çıkarır', async () => {
      const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Çıkaran');

      const created = await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/equipment`)
        .set('Authorization', authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({ catalogKey: 'blinkers-basic' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/equipment/${created.body.data.item.id}/equip`)
        .set('Authorization', authHeader)
        .expect(200);

      const unequipResponse = await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/equipment/${created.body.data.item.id}/unequip`)
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
        .set('Idempotency-Key', randomUUID())
        .send({ catalogKey: 'leg-wraps-basic' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/horses/${other.horseId}/equipment/${created.body.data.item.id}/equip`)
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
      .set('Idempotency-Key', randomUUID())
        .send({ catalogKey: 'saddle-basic' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/equipment/${created.body.data.item.id}/equip`)
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
