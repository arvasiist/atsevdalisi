import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadHorseAppearanceConfig } from '@at-sevdalisi/game-config';
import { deriveAppearance } from '../../src/domain/horse/appearance';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * ATIN GÖRÜNÜŞÜ (01.10.2026, migration 0051). 3D sahne "oyuncunun atını"
 * göstersin diye görünüş veritabanında saklanır ve API'de döner.
 *
 * KANITLANAN: başlangıç atının görünüşü `deriveAppearance(horseId, config)`
 * ile BİREBİR aynıdır (yani uygulama değeri açıkça yazar; sütun
 * varsayılanına — 'bay/none/none' — düşmez) ve `GET /horses` aynı değeri döner.
 */
describe('At görünüşü (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const config = loadHorseAppearanceConfig();

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  it("başlangıç atının görünüşü config'ten türetilir, saklanır ve API'de döner", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 8; i += 1) {
      const player = await registerTestPlayerWithStarterHorse(app, `Görünüş ${i}`);
      const expected = deriveAppearance(player.horseId, config);

      const row = await pool.query<{
        coat_color: string;
        face_marking: string;
        leg_marking: string;
      }>('SELECT coat_color, face_marking, leg_marking FROM horses WHERE id = $1', [
        player.horseId,
      ]);
      expect(row.rows[0]).toEqual({
        coat_color: expected.coatColor,
        face_marking: expected.faceMarking,
        leg_marking: expected.legMarking,
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/horses/${player.horseId}`)
        .set('Authorization', player.authHeader)
        .expect(200);
      expect(response.body.data.appearance).toEqual(expected);
      seen.add(`${expected.coatColor}/${expected.faceMarking}/${expected.legMarking}`);
    }
    // 8 at için tek bir kombinasyon görmek, değerin sabit bir varsayılandan geldiğine işaret ederdi.
    expect(seen.size).toBeGreaterThan(1);
  });
});
