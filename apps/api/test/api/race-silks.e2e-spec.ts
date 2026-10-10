import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAvatarConfig, loadCosmeticsConfig } from '@at-sevdalisi/game-config';
import type { Pool } from 'pg';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * JOKEY FORMASI YARIŞTA (09.10.2026 — kozmetik adım 3b).
 * Kanıtlananlar:
 *   (1) Avatarını kaydeden oyuncunun forma ana rengi (mağazadan alınmış
 *       premium renk dahil) yarış tekrarında (`/races/:id/timeline`) ve
 *       kontrollü pratik yarışın canlı görünümünde `silkColor` olarak gelir.
 *   (2) Avatarını kaydetmemiş oyuncu ve botlar `null` alır (istemci paleti) —
 *       türetilmiş varsayılan yarışta gösterilmez.
 *   (3) Renk yarış sonucunu etkilemez: alan yalnızca görünüm yanıtındadır.
 * Lobi canlı görünümü: `lobby-live-race.e2e-spec.ts` (tribün testi).
 */
describe('Jokey forması yarışta (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const avatarConfig = loadAvatarConfig();
  const premiumSilk = loadCosmeticsConfig().items.find((item) => item.catalog === 'silkColors')!;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function wearPremiumSilk(player: RegisteredTestPlayer): Promise<void> {
    await pool.query('UPDATE players SET gems = $2 WHERE id = $1', [player.playerId, premiumSilk.priceGems]);
    await http()
      .post(`/api/v1/cosmetics/${premiumSilk.key}/purchase`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    const current = await http().get('/api/v1/avatar').set('Authorization', player.authHeader).expect(200);
    await http()
      .put('/api/v1/avatar')
      .set('Authorization', player.authHeader)
      .send({ appearance: { ...current.body.data.appearance, silksPrimary: premiumSilk.optionId } })
      .expect(200);
  }

  async function practiceTimeline(player: RegisteredTestPlayer) {
    const race = await http()
      .post(`/api/v1/horses/${player.horseId}/practice-race`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    const timeline = await http()
      .get(`/api/v1/races/${race.body.data.raceId}/timeline`)
      .set('Authorization', player.authHeader)
      .expect(200);
    return timeline.body.data.entrants as Array<{ horseId: string | null; isBot: boolean; silkColor: string | null }>;
  }

  it('kayıtlı (premium) forma tekrarda görünür; kaydı olmayan oyuncu ve botlar null', async () => {
    const dressed = await registerTestPlayerWithStarterHorse(app, 'Formalı Jokey');
    const plain = await registerTestPlayerWithStarterHorse(app, 'Formasız Jokey');
    await wearPremiumSilk(dressed);

    const dressedEntrants = await practiceTimeline(dressed);
    const own = dressedEntrants.find((entrant) => entrant.horseId === dressed.horseId)!;
    expect(own.silkColor).toBe(avatarConfig.silkColors[premiumSilk.optionId]);
    expect(dressedEntrants.filter((entrant) => entrant.isBot).every((entrant) => entrant.silkColor === null)).toBe(true);

    const plainEntrants = await practiceTimeline(plain);
    expect(plainEntrants.find((entrant) => entrant.horseId === plain.horseId)!.silkColor).toBeNull();
  });

  it('kontrollü pratik yarışın canlı görünümü oyuncunun formasını taşır', async () => {
    const rider = await registerTestPlayerWithStarterHorse(app, 'Canlı Formalı');
    await wearPremiumSilk(rider);
    const started = await http()
      .post(`/api/v1/horses/${rider.horseId}/interactive-race`)
      .set('Authorization', rider.authHeader)
      .send({})
      .expect(200);
    const entrants = started.body.data.entrants as Array<{ isPlayer: boolean; silkColor: string | null }>;
    expect(entrants.find((entrant) => entrant.isPlayer)!.silkColor).toBe(avatarConfig.silkColors[premiumSilk.optionId]);
    expect(entrants.filter((entrant) => !entrant.isPlayer).every((entrant) => entrant.silkColor === null)).toBe(true);
  });
});
