import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { QuestBoardView } from '@at-sevdalisi/shared-types';
import { loadQuestsConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * YARIŞ KİMİNDİR? (03.10.2026, Faz 14 yolculuk testinin bulduğu hata,
 * migration 0063).
 *
 * Pratik/PvP katılımı `player_id` yazmıyordu; genel sıralama, sezon (ÖDÜLLÜ),
 * dönemsel sıralama, görevler, "son yarışlarım" ve tribün yarışı atın
 * ŞİMDİKİ sahibine yazıyordu. At satılınca satıcının geçmişi alıcıya
 * geçiyordu. Kanıtlananlar:
 *  1. Yeni pratik katılımı koşturan oyuncuyu yazar.
 *  2. At satıldıktan sonra yarış SATICIDA kalır: son yarışlar, görev
 *     ilerlemesi, genel sıralama; alıcıya hiçbiri geçmez.
 *  3. Migration 0063, `player_id`i silinmiş (eski biçimli) satırı defterden
 *     geri doldurur.
 */
describe('Yarış katılımının sahibi (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const quests = loadQuestsConfig();
  const MIGRATION = join(__dirname, '..', '..', '..', '..', 'database', 'migrations', '0063_backfill_practice_entry_player.up.sql');

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('satılan at yarış geçmişini alıcıya taşımaz; eski satır migration ile doldurulur', async () => {
    const seller = await registerTestPlayerWithStarterHorse(app, 'Sahiplik Satıcı');
    const buyer = await registerTestPlayerWithStarterHorse(app, 'Sahiplik Alıcı');
    const race = await http()
      .post(`/api/v1/horses/${seller.horseId}/practice-race`)
      .set('Authorization', seller.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    const raceId = (race.body.data.raceId ?? race.body.data.race?.id) as string;
    expect(typeof raceId).toBe('string');

    // 1) Yeni satır koşturan oyuncuyu taşır.
    const entry = await pool.query<{ id: string; player_id: string | null }>(
      'SELECT id, player_id FROM race_entries WHERE race_id = $1 AND bot_label IS NULL',
      [raceId],
    );
    expect(entry.rows).toHaveLength(1);
    expect(entry.rows[0]!.player_id).toBe(seller.playerId);

    // 2) At el değiştirir.
    const listing = await http()
      .post('/api/v1/market/listings')
      .set('Authorization', seller.authHeader)
      .send({ horseId: seller.horseId, price: quests.horsePurchaseMinPrice })
      .expect(201);
    await http()
      .post(`/api/v1/market/listings/${listing.body.data.id as string}/buy`)
      .set('Authorization', buyer.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);

    const recent = async (playerId: string, authHeader: string) =>
      (await http().get(`/api/v1/players/${playerId}/recent-races`).set('Authorization', authHeader).expect(200)).body
        .data as Array<{ raceId: string }>;
    const racesEntered = async (authHeader: string) =>
      ((await http().get('/api/v1/quests').set('Authorization', authHeader).expect(200)).body.data as QuestBoardView)
        .daily.quests.find((q) => q.metric === 'races_entered')!.progress;
    const leaderboardIds = async () =>
      ((await http().get('/api/v1/leaderboard').expect(200)).body.data as Array<{ playerId: string }>).map(
        (row) => row.playerId,
      );

    expect((await recent(seller.playerId, seller.authHeader)).map((r) => r.raceId)).toContain(raceId);
    expect((await recent(buyer.playerId, buyer.authHeader)).map((r) => r.raceId)).not.toContain(raceId);
    expect(await racesEntered(seller.authHeader)).toBe(1);
    expect(await racesEntered(buyer.authHeader)).toBe(0);
    expect(await leaderboardIds()).not.toContain(buyer.playerId);

    // 3) Eski biçim: `player_id` yok → migration defterden geri doldurur.
    const ledger = await pool.query(
      "SELECT 1 FROM economy_transactions WHERE reference_id = $1 AND type LIKE 'practice_race_%'",
      [raceId],
    );
    // Varsayılan pratik yarış ücretlidir → defterde koşturan oyuncu vardır
    // (yoksa bu adım boş olurdu; ücretsiz eski satır NULL kalır, tahmin yazılmaz).
    expect(ledger.rows.length).toBeGreaterThan(0);
    await pool.query('UPDATE race_entries SET player_id = NULL WHERE id = $1', [entry.rows[0]!.id]);
    await pool.query(readFileSync(MIGRATION, 'utf8'));
    const after = await pool.query<{ player_id: string | null }>('SELECT player_id FROM race_entries WHERE id = $1', [
      entry.rows[0]!.id,
    ]);
    expect(after.rows[0]!.player_id).toBe(seller.playerId);
  });
});
