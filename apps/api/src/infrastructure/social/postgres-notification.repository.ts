import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type {
  NotificationRepository,
  NotificationRow,
} from '../../application/ports/notification.repository';
import {
  normalizeNotificationPayload,
  parseNotificationType,
} from '../../domain/social/notification';
import { PG_POOL } from '../database/database.module';

/** `notifications` satır şekli (snake_case). */
interface NotificationDbRow {
  id: string;
  type: string;
  payload: unknown;
  read_at: Date | null;
  created_at: Date;
}

/**
 * Bildirim repository'si (brief §28, §42 PHASE 11).
 *
 * **SALT OKUMA + OKUNDU İŞARETLEME.** `INSERT INTO notifications` burada
 * YOKTUR — bildirim üretmek `PostgresRaceInviteRepository.saveInvite`ın
 * yetkisindedir ve o, davet satırıyla AYNI transaction'da yazar (bkz.
 * `notification.repository.ts` port doc yorumu). `withTransaction`
 * ÇAĞRILMAZ: buradaki her yazma TEK bir `UPDATE` ifadesidir, atomiklik
 * zaten ifade düzeyindedir.
 *
 * **`parseNotificationType` + `normalizeNotificationPayload` BURADA
 * ÇAĞRILIR (neden domain'de değil):** daraltma, VERİTABANI SINIRINDA
 * yapılmalıdır. Buradan `string` geçseydi, `NotificationType` olduğu
 * iddia edilen bir değer uygulamanın içine sızardı ve `NotificationView`
 * sözleşmesi çalışma anında çiğnenirdi. CHECK'e uymayan bir satır listeye
 * HİÇ GİRMEZ (`filter` + `map`, `flatMap` yerine ayrı ayrı — okunurluk).
 */
@Injectable()
export class PostgresNotificationRepository implements NotificationRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByPlayerId(playerId: string, limit: number): Promise<NotificationRow[]> {
    const result = await this.pool.query<NotificationDbRow>(
      `SELECT id, type, payload, read_at, created_at
       FROM notifications
       WHERE player_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [playerId, limit],
    );
    return result.rows.flatMap(toNotificationRow);
  }

  async findById(playerId: string, notificationId: string): Promise<NotificationRow | null> {
    const result = await this.pool.query<NotificationDbRow>(
      `SELECT id, type, payload, read_at, created_at
       FROM notifications
       WHERE id = $1 AND player_id = $2`,
      [notificationId, playerId],
    );
    const row = result.rows[0];
    return row ? (toNotificationRow(row)[0] ?? null) : null;
  }

  async countUnread(playerId: string): Promise<number> {
    const result = await this.pool.query<{ unread: number }>(
      `SELECT count(*)::int AS unread FROM notifications
       WHERE player_id = $1 AND read_at IS NULL`,
      [playerId],
    );
    // Boş kümede bile TEK satır döner; `?? 0` yalnızca
    // `noUncheckedIndexedAccess` içindir.
    return result.rows[0]?.unread ?? 0;
  }

  async markRead(playerId: string, notificationId: string, readAt: Date): Promise<NotificationRow | null> {
    // `read_at IS NULL` ŞART: aksi hâlde ikinci okuma, ilk okumanın zaman
    // damgasını EZERDİ (`markConversationRead` ile AYNI gerekçe).
    // `player_id = $1` — başkasının bildirimi işaretlenemez.
    const result = await this.pool.query<NotificationDbRow>(
      `UPDATE notifications SET read_at = $3
       WHERE id = $1 AND player_id = $2 AND read_at IS NULL
       RETURNING id, type, payload, read_at, created_at`,
      [notificationId, playerId, readAt],
    );
    const row = result.rows[0];
    return row ? (toNotificationRow(row)[0] ?? null) : null;
  }

  async markAllRead(playerId: string, readAt: Date): Promise<number> {
    const result = await this.pool.query(
      'UPDATE notifications SET read_at = $2 WHERE player_id = $1 AND read_at IS NULL',
      [playerId, readAt],
    );
    return result.rowCount ?? 0;
  }
}

/**
 * Satırı domain nesnesine çevirir; tür CHECK'e uymuyorsa BOŞ dizi döner.
 *
 * Dizi döndürmesinin sebebi `flatMap` ile kullanılmasıdır: bilinmeyen
 * türdeki TEK bir satır yüzünden TÜM listeyi 500 yapmak, tek bir bozuk
 * satırı bütün ekranı karartmaya çevirirdi (bkz. `parseNotificationType`
 * doc yorumu).
 */
function toNotificationRow(row: NotificationDbRow): NotificationRow[] {
  const type = parseNotificationType(row.type);
  if (type === null) return [];
  return [
    {
      notificationId: row.id,
      type,
      payload: normalizeNotificationPayload(row.payload),
      readAt: row.read_at,
      createdAt: row.created_at,
    },
  ];
}
