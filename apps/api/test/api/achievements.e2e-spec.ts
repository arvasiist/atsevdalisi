import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AchievementBoardView, PlayerProfileView } from '@at-sevdalisi/shared-types';
import { loadAchievementsConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * BAŞARIMLAR (03.10.2026, migration 0064). Kanıtlananlar: ilerleme türetilir
 * (yaşam boyu), tamamlanmamış başarım 409, ödül tek kez ve PARA YOLUYLA
 * (defter satırı aynı transaction), eşzamanlı iki talepten yalnızca biri
 * öder, kazanılan başarım herkese açık profilde görünür.
 */
describe('Başarımlar (e2e)', () => {
  const config = loadAchievementsConfig();
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const board = async (player: RegisteredTestPlayer): Promise<AchievementBoardView> =>
    (await http().get('/api/v1/achievements').set('Authorization', player.authHeader).expect(200)).body.data;
  const claim = (player: RegisteredTestPlayer, key: string) =>
    http().post(`/api/v1/achievements/${key}/claim`).set('Authorization', player.authHeader);
  const money = async (playerId: string) =>
    Number((await pool.query('SELECT money FROM players WHERE id = $1', [playerId])).rows[0].money);
  const firstOf = (metric: string, target = 1) =>
    config.achievements.find((a) => a.metric === metric && a.target === target)!;

  it('girişsiz 401; yeni oyuncu: config sırası, ilerleme 0 (seviye 1), hiçbiri alınmamış', async () => {
    await http().get('/api/v1/achievements').expect(401);
    const player = await registerTestPlayerWithStarterHorse(app, 'Başarım Yeni');
    const view = await board(player);
    expect(view.achievements.map((a) => a.key)).toEqual(config.achievements.map((a) => a.key));
    for (const achievement of view.achievements) {
      expect(achievement.claimed).toBe(false);
      expect(achievement.progress).toBe(achievement.metric === 'player_level' ? 1 : 0);
    }
  });

  it('tamamlanmamış 409 (para oynamaz); bilinmeyen/kalıp dışı anahtar 404', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Başarım Erken');
    const before = await money(player.playerId);
    const early = await claim(player, firstOf('races_entered').key).expect(409);
    expect(early.body.error.code).toBe('ACHIEVEMENT_NOT_COMPLETED');
    expect(await money(player.playerId)).toBe(before);
    expect((await claim(player, 'olmayan-basarim').expect(404)).body.error.code).toBe('ACHIEVEMENT_NOT_FOUND');
    expect((await claim(player, 'KÖTÜ_ANAHTAR').expect(404)).body.error.code).toBe('ACHIEVEMENT_NOT_FOUND');
  });

  it('ilk yarıştan sonra ödül alınır: bakiye + defter satırı aynı tutar; ikinci talep 409; profilde görünür', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Başarım Yarışçı');
    await http()
      .post(`/api/v1/horses/${player.horseId}/practice-race`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    const achievement = firstOf('races_entered');
    expect((await board(player)).achievements.find((a) => a.key === achievement.key)!.progress).toBe(1);

    const before = await money(player.playerId);
    const paid = await claim(player, achievement.key).expect(200);
    expect(paid.body.data.rewardMoney).toBe(achievement.rewardMoney);
    expect(await money(player.playerId)).toBe(before + achievement.rewardMoney);
    const ledger = await pool.query<{ amount: string; balance_before: string; balance_after: string }>(
      "SELECT amount, balance_before, balance_after FROM economy_transactions WHERE player_id = $1 AND type = 'achievement_reward'",
      [player.playerId],
    );
    expect(ledger.rows).toHaveLength(1);
    expect(Number(ledger.rows[0]!.amount)).toBe(achievement.rewardMoney);
    expect(Number(ledger.rows[0]!.balance_after)).toBe(before + achievement.rewardMoney);

    const again = await claim(player, achievement.key).expect(409);
    expect(again.body.error.code).toBe('ACHIEVEMENT_ALREADY_CLAIMED');
    expect((await board(player)).achievements.find((a) => a.key === achievement.key)!.claimed).toBe(true);

    const username = (await pool.query('SELECT username FROM players WHERE id = $1', [player.playerId])).rows[0]
      .username as string;
    const profile = (await http().get(`/api/v1/players/profile/${username}`).expect(200)).body.data as PlayerProfileView;
    expect(profile.achievements).toEqual([
      expect.objectContaining({ key: achievement.key, metric: 'races_entered', target: achievement.target }),
    ]);
  });

  it('eşzamanlı iki talep: yalnızca BİRİ öder (kilit + birincil anahtar)', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Başarım Yarış Koşulu');
    const level = firstOf('player_level', config.achievements.find((a) => a.metric === 'player_level')!.target);
    await pool.query('UPDATE players SET level = $2 WHERE id = $1', [player.playerId, level.target]);
    const before = await money(player.playerId);
    const results = await Promise.all([claim(player, level.key), claim(player, level.key)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await money(player.playerId)).toBe(before + level.rewardMoney);
  });

  it('hesap silinince kazanılmış başarımlar silinir, defter kalır', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Başarım Silinen');
    const level = config.achievements.find((a) => a.metric === 'player_level')!;
    await pool.query('UPDATE players SET level = $2 WHERE id = $1', [player.playerId, level.target]);
    await claim(player, level.key).expect(200);
    await http().post('/api/v1/account/delete').set('Authorization', player.authHeader).send({
      confirmUsername: player.username,
    }).expect(200);
    const claims = await pool.query('SELECT 1 FROM achievement_claims WHERE player_id = $1', [player.playerId]);
    expect(claims.rows).toHaveLength(0);
    const ledger = await pool.query(
      "SELECT 1 FROM economy_transactions WHERE player_id = $1 AND type = 'achievement_reward'",
      [player.playerId],
    );
    expect(ledger.rows).toHaveLength(1);
  });
});
