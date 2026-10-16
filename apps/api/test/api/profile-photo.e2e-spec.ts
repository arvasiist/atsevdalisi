import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AVATAR_STORAGE, type AvatarStorage } from '../../src/application/ports/avatar-storage';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { completePngBytes, phoneJpegBytes } from '../domain/avatar/fixtures';
import { bootstrapTestApp, registerTestPlayer, type RegisteredTestPlayer } from './test-helpers';

/**
 * PROFİL FOTOĞRAFI (08.10.2026, migration 0071). Kanıtlananlar: yükleme
 * baytlardan doğrulanır ve meta verisi (EXIF/GPS) silinerek saklanır; görüntü
 * token'sız sunulur ama yalnızca GÜNCEL fotoğraf (değiştirilen/silinen adres
 * 404, eski dosya depodan silinir); profil `photoId` taşır; moderatör denetim
 * kaydıyla kaldırır, sıradan oyuncu kaldıramaz; hesap silme fotoğrafı da siler.
 */
describe('Profil fotoğrafı (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let storage: AvatarStorage;
  const SECRET = 'GPS 41.0082N 28.9784E Ev adresi';

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    storage = app.get<AvatarStorage>(AVATAR_STORAGE);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  function upload(player: RegisteredTestPlayer, bytes: Uint8Array, contentType = 'image/jpeg', filename = 'foto.jpg') {
    return http()
      .post('/api/v1/avatar/photo')
      .set('Authorization', player.authHeader)
      .attach('photo', Buffer.from(bytes), { filename, contentType });
  }

  const storageKeyOf = async (playerId: string) =>
    (await pool.query<{ storage_key: string }>('SELECT storage_key FROM player_photos WHERE player_id = $1', [playerId]))
      .rows[0]?.storage_key ?? null;

  const usernameOf = async (playerId: string) =>
    (await pool.query<{ username: string }>('SELECT username FROM players WHERE id = $1', [playerId])).rows[0]!.username;

  it('yükler; meta veri silinmiş görüntü token\'sız ve güvenli başlıklarla sunulur; avatar + profil photoId taşır', async () => {
    const player = await registerTestPlayer(app, 'Fotoğraflı Oyuncu');
    const source = phoneJpegBytes(640, 480, SECRET);
    expect(Buffer.from(source).toString('latin1')).toContain(SECRET);

    const uploaded = await upload(player, source, 'image/jpeg', '../../etc/passwd.jpg').expect(201);
    const photo = uploaded.body.data as { photoId: string; width: number; height: number };
    expect(photo).toMatchObject({ width: 640, height: 480 });

    // Depo anahtarı sunucunun ürettiği kalıptadır — kullanıcının dosya adı yol olmaz.
    expect(await storageKeyOf(player.playerId)).toBe(`photos/${photo.photoId}.jpg`);

    const served = await http().get(`/api/v1/avatar/photos/${photo.photoId}`).buffer(true).expect(200);
    expect(served.headers['content-type']).toBe('image/jpeg');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['content-security-policy']).toContain("default-src 'none'");
    const body = served.body as Buffer;
    expect(body.toString('latin1')).not.toContain(SECRET);
    expect(body.toString('latin1')).toContain('Exif'); // yalnızca yön bilgisi yeniden yazıldı
    expect(body.length).toBeLessThan(source.length);

    const avatar = await http().get('/api/v1/avatar').set('Authorization', player.authHeader).expect(200);
    expect(avatar.body.data.photo).toMatchObject({ photoId: photo.photoId, width: 640, height: 480 });

    const profile = await http().get(`/api/v1/players/profile/${await usernameOf(player.playerId)}`).expect(200);
    expect(profile.body.data.photoId).toBe(photo.photoId);
  });

  it('değiştirilen fotoğrafın eski adresi 404 ve eski dosya depodan silinir; silme sonrası 404', async () => {
    const player = await registerTestPlayer(app, 'Fotoğraf Değiştiren');
    const first = (await upload(player, phoneJpegBytes(400, 400, SECRET)).expect(201)).body.data.photoId as string;
    const firstKey = (await storageKeyOf(player.playerId))!;
    const second = (await upload(player, completePngBytes(300, 300), 'image/png', 'yeni.png').expect(201)).body.data
      .photoId as string;
    expect(second).not.toBe(first);

    await http().get(`/api/v1/avatar/photos/${first}`).expect(404);
    expect(await storage.get(firstKey)).toBeNull();
    const served = await http().get(`/api/v1/avatar/photos/${second}`).expect(200);
    expect(served.headers['content-type']).toBe('image/png');

    const secondKey = (await storageKeyOf(player.playerId))!;
    await http().delete('/api/v1/avatar/photo').set('Authorization', player.authHeader).expect(200);
    await http().get(`/api/v1/avatar/photos/${second}`).expect(404);
    expect(await storage.get(secondKey)).toBeNull();
    const avatar = await http().get('/api/v1/avatar').set('Authorization', player.authHeader).expect(200);
    expect(avatar.body.data.photo).toBeNull();
    await http().delete('/api/v1/avatar/photo').set('Authorization', player.authHeader).expect(404);
  });

  it('geçersiz dosya 422 PHOTO_REJECTED ve hiçbir şey saklanmaz; token\'sız yükleme 401', async () => {
    const player = await registerTestPlayer(app, 'Fotoğraf Reddi');
    const cases: Array<[Uint8Array, string, string]> = [
      [Uint8Array.from(Buffer.from('<svg onload="alert(1)"></svg>')), 'image/svg+xml', 'x.svg'],
      [phoneJpegBytes(640, 480, SECRET), 'image/png', 'yalan.png'],
      [phoneJpegBytes(40, 40, SECRET), 'image/jpeg', 'kucuk.jpg'],
    ];
    for (const [bytes, type, name] of cases) {
      const response = await upload(player, bytes, type, name).expect(422);
      expect(response.body.error.code).toBe('PHOTO_REJECTED');
    }
    const missing = await http().post('/api/v1/avatar/photo').set('Authorization', player.authHeader).expect(422);
    expect(missing.body.error.code).toBe('PHOTO_REJECTED');
    expect(await storageKeyOf(player.playerId)).toBeNull();

    await http()
      .post('/api/v1/avatar/photo')
      .attach('photo', Buffer.from(phoneJpegBytes(640, 480, SECRET)), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(401);
    await http().get('/api/v1/avatar/photos/bozuk-kimlik').expect(400);
  });

  it('moderatör uygunsuz fotoğrafı denetim kaydıyla kaldırır; sıradan oyuncu kaldıramaz (403, satır durur)', async () => {
    const owner = await registerTestPlayer(app, 'Uygunsuz Fotoğraf');
    const stranger = await registerTestPlayer(app, 'Meraklı Oyuncu');
    const moderator = await registerTestPlayer(app, 'Fotoğraf Moderatörü');
    await pool.query('UPDATE players SET is_moderator = true WHERE id = $1', [moderator.playerId]);
    const photoId = (await upload(owner, phoneJpegBytes(500, 500, SECRET)).expect(201)).body.data.photoId as string;
    const key = (await storageKeyOf(owner.playerId))!;

    const denied = await http()
      .delete(`/api/v1/admin/players/${owner.playerId}/photo`)
      .set('Authorization', stranger.authHeader)
      .send({ reason: 'Uygunsuz içerik' })
      .expect(403);
    expect(denied.body.error.code).toBe('ADMIN_REQUIRED');
    expect(await storageKeyOf(owner.playerId)).toBe(key);

    await http()
      .delete(`/api/v1/admin/players/${owner.playerId}/photo`)
      .set('Authorization', moderator.authHeader)
      .send({ reason: 'Uygunsuz içerik — kurallara aykırı' })
      .expect(200);
    await http().get(`/api/v1/avatar/photos/${photoId}`).expect(404);
    expect(await storage.get(key)).toBeNull();
    const audit = await pool.query(
      `SELECT admin_id, details FROM admin_audit_log WHERE action = 'player.photo_removed' AND target_id = $1`,
      [owner.playerId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].admin_id).toBe(moderator.playerId);
    expect(audit.rows[0].details).toMatchObject({ reason: 'Uygunsuz içerik — kurallara aykırı', photoId });
  });

  it('hesap silme fotoğrafı (satır + dosya) siler', async () => {
    const player = await registerTestPlayer(app, 'Silinecek Fotoğraf');
    const photoId = (await upload(player, phoneJpegBytes(500, 500, SECRET)).expect(201)).body.data.photoId as string;
    const key = (await storageKeyOf(player.playerId))!;
    await http()
      .post('/api/v1/account/delete')
      .set('Authorization', player.authHeader)
      .send({ confirmUsername: await usernameOf(player.playerId) })
      .expect((response) => {
        if (response.status >= 400) throw new Error(`silme başarısız: ${JSON.stringify(response.body)}`);
      });
    expect(await storageKeyOf(player.playerId)).toBeNull();
    expect(await storage.get(key)).toBeNull();
    await http().get(`/api/v1/avatar/photos/${photoId}`).expect(404);
  });
});
