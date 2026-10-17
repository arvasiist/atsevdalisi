import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadStableConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { insertBreedingHorse } from './breeding-test-kit';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, sendConcurrentRequests } from './test-helpers';

/**
 * AHIR BÖLMELERİ (16.10.2026, migration 0097). Kilitlenenler: her atın bir
 * bölmesi var (liste + özet aynı kuraldan); taşıma boş bölmeye geçer, dolu
 * bölmede yer değiştirir; kilitli bölme 409 STALL_LOCKED (hiçbir şey yazılmaz);
 * başkasının atı 404, başkasının ahırı 403, bozuk girdi 400; at el değiştirince
 * bölmesi boşalır (tetikleyici); eşzamanlı taşımalar tekil yerleşimi bozmaz.
 */
describe('Ahır bölmeleri (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const stable = loadStableConfig();
  const maxStalls = stable.capacityByLevel[String(Math.max(...Object.keys(stable.capacityByLevel).map(Number)))]!;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const move = (playerId: string, authHeader: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`/api/v1/players/${playerId}/stable/stalls`).set('Authorization', authHeader).send(body);

  const stallsOf = async (playerId: string, authHeader: string) => {
    const list = await request(app.getHttpServer())
      .get(`/api/v1/horses?ownerId=${playerId}`)
      .set('Authorization', authHeader)
      .expect(200);
    return new Map((list.body.data as Array<{ id: string; stallNumber: number }>).map((h) => [h.id, h.stallNumber]));
  };

  it('başlangıç atı 1. bölmede; özet dolu bölmeleri ve toplam bölme sayısını taşır', async () => {
    const { playerId, authHeader, horseId } = await registerTestPlayerWithStarterHorse(app, 'Bölme Sahibi');
    expect((await stallsOf(playerId, authHeader)).get(horseId)).toBe(1);
    const summary = await request(app.getHttpServer())
      .get(`/api/v1/players/${playerId}/stable-summary`)
      .set('Authorization', authHeader)
      .expect(200);
    expect(summary.body.data.stalls).toEqual([{ stallNumber: 1, horseId, horseName: expect.any(String) }]);
    expect(summary.body.data.maxStalls).toBe(maxStalls);
  });

  it('taşıma: boş bölmeye geçer, dolu bölmede yer değiştirir; kilitli bölme 409 ve hiçbir şey yazılmaz', async () => {
    const { playerId, authHeader, horseId: first } = await registerTestPlayerWithStarterHorse(app, 'Düzenleyen');
    const second = await insertBreedingHorse(pool, playerId, 'İkinci Bölme', 'mare', { retired: false });
    expect(await stallsOf(playerId, authHeader)).toEqual(new Map([[first, 1], [second, 2]]));

    const moved = await move(playerId, authHeader, { horseId: first, stallNumber: 4 }).expect(200);
    expect(moved.body.data.capacity).toBe(stable.capacityByLevel['1']);
    expect(moved.body.data.stalls.map((s: { horseId: string; stallNumber: number }) => [s.horseId, s.stallNumber])).toEqual([
      [second, 2],
      [first, 4],
    ]);

    await move(playerId, authHeader, { horseId: second, stallNumber: 4 }).expect(200);
    expect(await stallsOf(playerId, authHeader)).toEqual(new Map([[first, 2], [second, 4]]));

    const locked = await move(playerId, authHeader, { horseId: first, stallNumber: stable.capacityByLevel['1']! + 1 });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('STALL_LOCKED');
    expect(await stallsOf(playerId, authHeader)).toEqual(new Map([[first, 2], [second, 4]]));

    // Ahır gelişince kilit açılır.
    await pool.query('UPDATE players SET stable_level = 2 WHERE id = $1', [playerId]);
    await move(playerId, authHeader, { horseId: first, stallNumber: stable.capacityByLevel['1']! + 1 }).expect(200);
  });

  it('başkasının atı 404, başkasının ahırı 403, bozuk girdi 400', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Kendi Ahırı');
    const stranger = await registerTestPlayerWithStarterHorse(app, 'Yabancı');
    const foreign = await move(owner.playerId, owner.authHeader, { horseId: stranger.horseId, stallNumber: 2 });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('HORSE_NOT_FOUND');
    await move(stranger.playerId, owner.authHeader, { horseId: owner.horseId, stallNumber: 2 }).expect(403);
    await move(owner.playerId, owner.authHeader, { horseId: 'bir-at', stallNumber: 2 }).expect(400);
    for (const stallNumber of ['3', 0, 1.5, null]) {
      await move(owner.playerId, owner.authHeader, { horseId: owner.horseId, stallNumber }).expect(400);
    }
    // Hiçbiri yazılmadı: başlangıç atı hâlâ türetilmiş 1. bölmede, kayıt NULL.
    const row = await pool.query('SELECT stall_number FROM horses WHERE id = $1', [owner.horseId]);
    expect(row.rows[0].stall_number).toBeNull();
  });

  it('at el değiştirince bölmesi boşalır (tetikleyici) ve yeni sahibin en düşük boş bölmesine yerleşir', async () => {
    const seller = await registerTestPlayerWithStarterHorse(app, 'Satan Ahırcı');
    const buyer = await registerTestPlayerWithStarterHorse(app, 'Alan Ahırcı');
    const sold = await insertBreedingHorse(pool, seller.playerId, 'Satılık Bölme', 'mare', { retired: false });
    await move(seller.playerId, seller.authHeader, { horseId: sold, stallNumber: 3 }).expect(200);
    expect((await pool.query('SELECT stall_number FROM horses WHERE id = $1', [sold])).rows[0].stall_number).toBe(3);

    await pool.query('UPDATE horses SET owner_id = $2 WHERE id = $1', [sold, buyer.playerId]);
    expect((await pool.query('SELECT stall_number FROM horses WHERE id = $1', [sold])).rows[0].stall_number).toBeNull();
    expect((await stallsOf(buyer.playerId, buyer.authHeader)).get(sold)).toBe(2);
  });

  it('eşzamanlı taşımalar yerleşimi bozmaz: her bölmede en fazla bir at', async () => {
    const { playerId, authHeader, horseId } = await registerTestPlayerWithStarterHorse(app, 'Kalabalık Ahır');
    const others = [
      await insertBreedingHorse(pool, playerId, 'Bölme İki', 'mare', { retired: false }),
      await insertBreedingHorse(pool, playerId, 'Bölme Üç', 'stallion', { retired: false }),
      await insertBreedingHorse(pool, playerId, 'Bölme Dört', 'mare', { retired: false }),
    ];
    const horses = [horseId, ...others];
    const responses = await sendConcurrentRequests(12, (index) =>
      move(playerId, authHeader, { horseId: horses[index % horses.length], stallNumber: (index % 5) + 1 }),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const stalls = [...(await stallsOf(playerId, authHeader)).values()];
    expect(new Set(stalls).size).toBe(horses.length);
    for (const stall of stalls) expect(stall).toBeLessThanOrEqual(stable.capacityByLevel['1']!);
  });
});
