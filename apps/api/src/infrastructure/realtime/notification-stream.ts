import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { loadOpsConfig } from '@at-sevdalisi/game-config';
import type { NotificationView } from '@at-sevdalisi/shared-types';
import { toNotificationView } from '../../application/use-cases/notification.mapper';
import { PG_POOL } from '../database/database.module';
import { PostgresNotificationRepository } from '../social/postgres-notification.repository';

const MS_PER_SECOND = 1000;

/** Bildirimi yerel soketlere ileten taraf (`RaceGateway.notifyNotificationLocal`). */
export interface LocalNotificationSink {
  notifyNotificationLocal(playerId: string, notification: NotificationView): void;
}

export const LOCAL_NOTIFICATION_SINK = Symbol('LOCAL_NOTIFICATION_SINK');

/** `pg_notify` yükü — tetikleyici yalnızca kimlikleri yazar (migration 0088). */
export function parseNotificationSignal(payload: string | undefined): { id: string; playerId: string } | null {
  if (payload === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { id, playerId } = parsed as Record<string, unknown>;
    return typeof id === 'string' && typeof playerId === 'string' ? { id, playerId } : null;
  } catch {
    return null;
  }
}

/**
 * 16.10.2026 — CANLI BİLDİRİM AKIŞI (brief §13). Her `notifications` satırı
 * COMMIT olunca tetikleyici `NOTIFY` yollar (geri alınan işin bildirimi
 * yayınlanmaz); bu servis ayrılmış bir havuz bağlantısında `LISTEN` eder,
 * satırı kimlikle okur ve `notification.created`ı YEREL soketlere yayar.
 * Her örnek dinler ve yalnızca kendi soketlerine yayar → Redis köprüsü
 * varken bile her soket olayı bir kez alır (köprüden yayınlansaydı N kez).
 *
 * Best-effort: bağlantı koparsa `reconnectSeconds` sonra yeniden dinler; o
 * aradaki bildirimler satırda durur, liste açılınca görünür (veri kaybı yok).
 */
@Injectable()
export class NotificationStreamListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationStreamListener.name);
  private readonly settings = loadOpsConfig().realtime.notificationStream;
  private readonly notifications: PostgresNotificationRepository;
  private client: PoolClient | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(LOCAL_NOTIFICATION_SINK) private readonly sink: LocalNotificationSink,
  ) {
    this.notifications = new PostgresNotificationRepository(pool);
  }

  async onModuleInit(): Promise<void> {
    if (!this.settings.enabled) return;
    await this.listen();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.retry !== null) clearTimeout(this.retry);
    await this.release();
  }

  private async listen(): Promise<void> {
    if (this.stopped) return;
    try {
      const client = await this.pool.connect();
      this.client = client;
      client.on('notification', this.onNotification);
      client.on('error', this.onError);
      // Kanal adı config'ten; tanımlayıcı olarak tırnaklanır.
      await client.query(`LISTEN "${this.settings.channel.replace(/"/g, '')}"`);
    } catch (error) {
      this.scheduleReconnect(error);
    }
  }

  private readonly onNotification = (message: { channel: string; payload?: string }): void => {
    if (message.channel !== this.settings.channel) return;
    void this.deliver(message.payload);
  };

  private readonly onError = (error: Error): void => this.scheduleReconnect(error);

  private scheduleReconnect(error: unknown): void {
    if (this.stopped || this.retry !== null) return;
    this.logger.warn(`Bildirim akışı koptu, yeniden denenecek: ${error instanceof Error ? error.name : 'hata'}`);
    void this.release(true);
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.listen();
    }, this.settings.reconnectSeconds * MS_PER_SECOND);
  }

  private async deliver(payload: string | undefined): Promise<void> {
    const signal = parseNotificationSignal(payload);
    if (signal === null) return;
    try {
      const row = await this.notifications.findById(signal.playerId, signal.id);
      if (row !== null) this.sink.notifyNotificationLocal(signal.playerId, toNotificationView(row));
    } catch {
      // Okunamayan bildirim yayınlanmaz; satır listede durur.
    }
  }

  /**
   * Ayrılmış bağlantı havuza GERİ KONMAZ (`release(true)` = kapat): LISTEN
   * durumu ve dinleyiciler başka bir işe sızmasın.
   */
  private async release(broken = false): Promise<void> {
    const client = this.client;
    this.client = null;
    if (client === null) return;
    client.removeListener('notification', this.onNotification);
    try {
      if (!broken) await client.query('UNLISTEN *');
    } catch {
      // bağlantı zaten kopmuş olabilir
    }
    client.removeListener('error', this.onError);
    // Kapatılırken gelen geç 'error' süreci çökertmesin.
    client.on('error', () => undefined);
    client.release(true);
  }
}
