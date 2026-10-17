import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { EQUIPMENT_TYPES } from '../../src/domain/equipment/validation';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * EKİPMAN DAYANIKLILIĞI + ZEMİNE ÖZEL NAL + KOZMETİK (16.10.2026, brief §8,
 * migration 0096). Kilitlenenler: dayanıklılık ve zemin katalogdan yazılır;
 * kuşanılı parça her koşulan yarışta 1 aşınır, 0'da çıkarılır ve yeniden
 * kuşanılamaz (409); kuşanılmamış ve kozmetik parça aşınmaz; zemine özel nal
 * yalnızca kendi zemininde bonus verir; kozmetik yarış çarpanını değiştirmez.
 * Pratik yarışın zemini çimdir (`PRACTICE_RACE_SURFACE`).
 */
describe('Ekipman dayanıklılığı (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const buy = (horseId: string, authHeader: string, catalogKey: string) =>
    request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/equipment`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ catalogKey });

  const equip = (horseId: string, authHeader: string, equipmentId: string) =>
    request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/equipment/${equipmentId}/equip`)
      .set('Authorization', authHeader);

  const practice = (horseId: string, authHeader: string) =>
    request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({});

  const row = async (equipmentId: string) =>
    (
      await pool.query<{ races_remaining: number | null; equipped: boolean; worn_out_at: Date | null }>(
        'SELECT races_remaining, equipped, worn_out_at FROM horse_equipment WHERE id = $1',
        [equipmentId],
      )
    ).rows[0]!;

  const lastSnapshotModifier = async (horseId: string) =>
    Number(
      (
        await pool.query<{ modifier: string }>(
          `SELECT horse_snapshot->>'equipmentModifier' AS modifier
             FROM race_entries WHERE horse_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [horseId],
        )
      ).rows[0]!.modifier,
    );

  /** Yarış kapısına takılmasın: yetişkin, dinlenmiş, seviyesi ve parası yeterli. */
  const prepare = async (playerId: string, horseId: string) => {
    await pool.query('UPDATE players SET money = 20000, level = 8 WHERE id = $1', [playerId]);
    await pool.query('UPDATE horses SET energy = 100, fatigue = 0, health = 100 WHERE id = $1', [horseId]);
  };

  it('katalogdan dayanıklılık + zemin yazılır; kozmetik aşınmaz', async () => {
    const { horseId, authHeader, playerId } = await registerTestPlayerWithStarterHorse(app, 'Dayanıklılık Alıcı');
    await prepare(playerId, horseId);

    const saddle = await buy(horseId, authHeader, 'saddle-basic').expect(201);
    expect(saddle.body.data.item).toMatchObject({ maxRaces: 40, racesRemaining: 40, surface: null, wornOutAt: null });

    const shoe = await buy(horseId, authHeader, 'horseshoe-grass').expect(201);
    expect(shoe.body.data.item).toMatchObject({ surface: 'grass', maxRaces: 20, racesRemaining: 20 });

    const blanket = await buy(horseId, authHeader, 'blanket-stable').expect(201);
    expect(blanket.body.data.item).toMatchObject({ equipmentType: 'blanket', quality: 0, maxRaces: null, racesRemaining: null });
  });

  it('kuşanılı parça yarışta 1 aşınır; 0 olunca çıkarılır ve yeniden kuşanılamaz (409); kuşanılmamış parça aşınmaz', async () => {
    const { horseId, authHeader, playerId } = await registerTestPlayerWithStarterHorse(app, 'Aşınma Yarışçısı');
    await prepare(playerId, horseId);
    const worn = (await buy(horseId, authHeader, 'saddle-basic').expect(201)).body.data.item.id as string;
    const spare = (await buy(horseId, authHeader, 'bridle-basic').expect(201)).body.data.item.id as string;
    const shoe = (await buy(horseId, authHeader, 'horseshoe-basic').expect(201)).body.data.item.id as string;
    await equip(horseId, authHeader, worn).expect(200);
    await equip(horseId, authHeader, shoe).expect(200);
    // Ömrünün sonuna getir (SQL fikstürü): bir yarış kaldı.
    await pool.query('UPDATE horse_equipment SET races_remaining = 1 WHERE id = $1', [worn]);

    await practice(horseId, authHeader).expect(200);

    const after = await row(worn);
    expect(after.races_remaining).toBe(0);
    expect(after.equipped).toBe(false);
    expect(after.worn_out_at).not.toBeNull();
    expect((await row(shoe)).races_remaining).toBe(39); // kuşanılı, ömrü sürüyor
    expect((await row(spare)).races_remaining).toBe(40); // kuşanılmamış: aşınmaz

    const retry = await equip(horseId, authHeader, worn);
    expect(retry.status).toBe(409);
    expect(retry.body.error.code).toBe('EQUIPMENT_WORN_OUT');
    // Aşınmış parça çarpana girmez: listede durur ama kuşanılı değildir.
    const list = await request(app.getHttpServer())
      .get(`/api/v1/horses/${horseId}/equipment`)
      .set('Authorization', authHeader)
      .expect(200);
    expect(list.body.data.find((item: { id: string }) => item.id === worn)).toMatchObject({
      equipped: false,
      racesRemaining: 0,
    });
  });

  it('zemine özel nal yalnızca kendi zemininde bonus verir; kozmetik çarpanı değiştirmez', async () => {
    const { horseId, authHeader, playerId } = await registerTestPlayerWithStarterHorse(app, 'Zemin Nalı');
    await prepare(playerId, horseId);
    const dirtShoe = (await buy(horseId, authHeader, 'horseshoe-dirt').expect(201)).body.data.item.id as string;
    const blanket = (await buy(horseId, authHeader, 'blanket-champion').expect(201)).body.data.item.id as string;
    await equip(horseId, authHeader, dirtShoe).expect(200);
    await equip(horseId, authHeader, blanket).expect(200);

    // Pratik yarış çimde: kum nalı + kozmetik battaniye → bonus YOK.
    await practice(horseId, authHeader).expect(200);
    expect(await lastSnapshotModifier(horseId)).toBe(1);
    expect((await row(blanket)).races_remaining).toBeNull();

    const grassShoe = (await buy(horseId, authHeader, 'horseshoe-grass').expect(201)).body.data.item.id as string;
    await equip(horseId, authHeader, grassShoe).expect(200);
    await pool.query('UPDATE horses SET energy = 100, fatigue = 0 WHERE id = $1', [horseId]);
    await practice(horseId, authHeader).expect(200);
    // Çim nalı kalitesi 80 → 1 + 0.80 × 0.01.
    expect(await lastSnapshotModifier(horseId)).toBeCloseTo(1.008, 10);
  });

  it('veritabanı kısıtı domain tip listesiyle birebir (en son migration)', () => {
    const dir = join(__dirname, '../../../../database/migrations');
    const latest = readdirSync(dir)
      .filter((name) => name.endsWith('.up.sql'))
      .sort()
      .reverse()
      .map((name) => readFileSync(join(dir, name), 'utf-8'))
      .find((sql) => sql.includes('horse_equipment_type_valid'))!;
    const listed = /horse_equipment_type_valid CHECK \(equipment_type IN \(([\s\S]*?)\)\)/.exec(latest)![1]!;
    const types = [...listed.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect([...types].sort()).toEqual([...EQUIPMENT_TYPES].sort());
  });
});
