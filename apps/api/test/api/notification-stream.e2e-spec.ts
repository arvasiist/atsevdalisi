import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NotificationView } from '@at-sevdalisi/shared-types';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, recordSharedFinishedRace, registerTestPlayer } from './test-helpers';

const WAIT_MS = 10_000;
/** "Olay GELMEDİ" iddiası için bekleme (akış tek bağlantı + tek sorgu; ms'ler içinde yayınlar). */
const SILENCE_MS = 1_500;

/**
 * 16.10.2026 — CANLI BİLDİRİM AKIŞI (brief §13, migration 0088). Eskiden
 * `notification.created` yalnızca yarış davetinde yayınlanıyordu; diğer 11
 * üreticinin bildirimi ancak liste yenilenince görünüyordu. Kanıtlananlar:
 *   (1) gerçek bir üretici (arkadaşlık isteği) commit edince alıcının soketine
 *       `notification.created` gelir — tam satırla, BİR kez;
 *   (2) geri alınan (ROLLBACK) bir bildirim yayınlanMAZ;
 *   (3) başka oyuncunun bildirimi bu sokete gelmez (oyuncu odası).
 */
describe('Canlı bildirim akışı (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let baseUrl: string;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  async function connect(token: string): Promise<Socket> {
    const client = io(`${baseUrl}/races`, { auth: { token }, transports: ['websocket'], forceNew: true });
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', reject);
      setTimeout(() => reject(new Error('bağlantı zaman aşımı')), WAIT_MS);
    });
    return client;
  }

  function collect(client: Socket): NotificationView[] {
    const received: NotificationView[] = [];
    client.on('notification.created', (event: NotificationView) => received.push(event));
    return received;
  }

  const waitFor = async (predicate: () => boolean): Promise<void> => {
    const deadline = Date.now() + WAIT_MS;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error('olay zaman aşımı');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };

  it('arkadaşlık isteği bildirimi alıcının soketine canlı ve bir kez gelir; başkasına gelmez', async () => {
    const [sender, recipient, bystander] = await Promise.all([
      registerTestPlayer(app, 'Akış Gönderen'),
      registerTestPlayer(app, 'Akış Alıcı'),
      registerTestPlayer(app, 'Akış Seyirci'),
    ]);
    await recordSharedFinishedRace(app, [sender, recipient]);
    const recipientSocket = await connect(recipient.token);
    const bystanderSocket = await connect(bystander.token);
    try {
      const received = collect(recipientSocket);
      const leaked = collect(bystanderSocket);
      await request(app.getHttpServer())
        .post(`/api/v1/players/${sender.playerId}/friend-requests`)
        .set('Authorization', sender.authHeader)
        .send({ addresseeId: recipient.playerId })
        .expect(201);
      await waitFor(() => received.length > 0);
      await new Promise((resolve) => setTimeout(resolve, SILENCE_MS));
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({ type: 'friend_request', readAt: null });
      const stored = await pool.query('SELECT id FROM notifications WHERE player_id = $1', [recipient.playerId]);
      expect(received[0]!.notificationId).toBe(stored.rows[0].id);
      expect(leaked).toHaveLength(0);
    } finally {
      recipientSocket.disconnect();
      bystanderSocket.disconnect();
    }
  });

  it('geri alınan bildirim yayınlanmaz (NOTIFY yalnızca COMMIT’te teslim edilir)', async () => {
    const player = await registerTestPlayer(app, 'Akış Geri Alma');
    const socket = await connect(player.token);
    try {
      const received = collect(socket);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO notifications (player_id, type, payload) VALUES ($1, 'friend_request', '{}'::jsonb)`,
          [player.playerId],
        );
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      await new Promise((resolve) => setTimeout(resolve, SILENCE_MS));
      expect(received).toHaveLength(0);
    } finally {
      socket.disconnect();
    }
  });
});
