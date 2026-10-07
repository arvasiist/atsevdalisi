import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AvatarView, PlayerProfileView } from '@at-sevdalisi/shared-types';
import { loadAvatarConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { avatarOptions } from '../../src/domain/avatar/avatar';
import { bootstrapTestApp, registerTestPlayer, type RegisteredTestPlayer } from './test-helpers';

/**
 * MANUEL AVATAR (07.10.2026, migration 0066). Kanıtlananlar: kayıtsız oyuncu
 * kimlikten türetilen varsayılanla görünür; kaydetme yalnızca katalog
 * değerlerini kabul eder (400 INVALID_AVATAR, satır yazılmaz); kayıt kalıcıdır
 * ve herkese açık profile yansır; yalnızca kendi avatarın değişir; hesap
 * silinince satır silinir.
 */
describe('Avatar (e2e)', () => {
  const config = loadAvatarConfig();
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
  const get = async (player: RegisteredTestPlayer): Promise<AvatarView> =>
    (await http().get('/api/v1/avatar').set('Authorization', player.authHeader).expect(200)).body.data;
  const save = (player: RegisteredTestPlayer, appearance: unknown) =>
    http().put('/api/v1/avatar').set('Authorization', player.authHeader).send({ appearance });
  const rows = async (playerId: string) =>
    (await pool.query('SELECT 1 FROM player_avatars WHERE player_id = $1', [playerId])).rows.length;

  it('girişsiz 401; yeni oyuncu varsayılan avatarla gelir (aynı istek aynı avatar)', async () => {
    await http().get('/api/v1/avatar').expect(401);
    const player = await registerTestPlayer(app, 'Avatar Yeni');
    const first = await get(player);
    expect(first.source).toBe('default');
    expect(first.updatedAt).toBeNull();
    expect(await get(player)).toEqual(first);
    expect(await rows(player.playerId)).toBe(0);
  });

  it('katalog dışı / eksik / fazla alan 400 INVALID_AVATAR ve hiçbir satır yazılmaz', async () => {
    const player = await registerTestPlayer(app, 'Avatar Hatalı');
    const base = (await get(player)).appearance;
    for (const bad of [
      { ...base, hairColor: '#ff0000' },
      { ...base, extra: 'x' },
      (({ hat: _hat, ...rest }) => rest)(base),
      'metin',
      undefined,
    ]) {
      const response = await save(player, bad).expect(400);
      expect(response.body.error.code).toBe('INVALID_AVATAR');
    }
    expect(await rows(player.playerId)).toBe(0);
  });

  it('kaydedilen avatar kalıcıdır ve herkese açık profile yansır; başkasınınki değişmez', async () => {
    const player = await registerTestPlayer(app, 'Avatar Kaydeden');
    const other = await registerTestPlayer(app, 'Avatar Diğer');
    const otherBefore = await get(other);
    const choice = Object.fromEntries(
      Object.keys((await get(player)).appearance).map((field) => {
        const options = avatarOptions(field as never, config);
        return [field, options[options.length - 1]];
      }),
    );
    const saved = (await save(player, choice).expect(200)).body.data as AvatarView;
    expect(saved).toMatchObject({ appearance: choice, source: 'manual' });
    expect(await get(player)).toEqual(saved);
    expect(await get(other)).toEqual(otherBefore);

    const profile = (await http().get(`/api/v1/players/profile/${player.username}`).expect(200)).body
      .data as PlayerProfileView;
    expect(profile.avatar).toEqual(choice);
  });

  it('katalogdan kaldırılmış eski seçim varsayılana düşer (500 değil)', async () => {
    const player = await registerTestPlayer(app, 'Avatar Eski');
    const valid = (await get(player)).appearance;
    await save(player, valid).expect(200);
    await pool.query(
      "UPDATE player_avatars SET appearance = jsonb_set(appearance, '{hat}', '\"kaldirilmis-sapka\"') WHERE player_id = $1",
      [player.playerId],
    );
    const view = await get(player);
    expect(view.source).toBe('default');
  });

  it('hesap silinince avatar satırı silinir', async () => {
    const player = await registerTestPlayer(app, 'Avatar Silinen');
    await save(player, (await get(player)).appearance).expect(200);
    expect(await rows(player.playerId)).toBe(1);
    await http()
      .post('/api/v1/account/delete')
      .set('Authorization', player.authHeader)
      .send({ confirmUsername: player.username })
      .expect(200);
    expect(await rows(player.playerId)).toBe(0);
  });
});
