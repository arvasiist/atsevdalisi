import { Inject, Injectable } from '@nestjs/common';
import type { NotificationListResult } from '@at-sevdalisi/shared-types';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { NOTIFICATION_REPOSITORY, type NotificationRepository } from '../ports/notification.repository';
import { toNotificationView } from './notification.mapper';

/**
 * Oyuncunun bildirimlerini listeler. `GET /players/:id/notifications`.
 *
 * brief §28'in ekranı: okunmamış rozeti + en yeniden eskiye liste.
 *
 * **İKİ SORGU PARALEL KOŞAR** (`findOverview` ile AYNI desen): liste ve
 * okunmamış SAYISI birbirine bağımlı değildir ve tek turda dönmelidir.
 *
 * **`unreadCount` NEDEN LİSTEDEN SAYILMAZ:** liste `notificationsLimit`
 * ile KIRPILMIŞTIR; rozeti kırpılmış diziden saymak, 60 okunmamış
 * bildirimi olan bir oyuncuya 50 gösterirdi (bkz. `NotificationListResult`
 * ve `NotificationRepository.countUnread` doc yorumları).
 *
 * **BU BİR OKUMA UCUDUR** — hiçbir satır yazılmaz, `assertSelf` controller
 * katmanındadır (bkz. `ListMyTicketsUseCase` ile AYNI sınır: use-case
 * "kim soruyor" sorusunu sormaz, o soru API katmanının işidir).
 */
@Injectable()
export class ListNotificationsUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly notificationRepository: NotificationRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string): Promise<NotificationListResult> {
    const [rows, unreadCount] = await Promise.all([
      this.notificationRepository.findByPlayerId(playerId, this.config.social.notificationsLimit),
      this.notificationRepository.countUnread(playerId),
    ]);

    return { notifications: rows.map(toNotificationView), unreadCount };
  }
}
