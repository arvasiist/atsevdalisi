import { Inject, Injectable } from '@nestjs/common';
import { NOTIFICATION_REPOSITORY, type NotificationRepository } from '../ports/notification.repository';

/** `POST /players/:id/notifications/read-all` yanıtı. */
export interface MarkAllNotificationsReadResult {
  /** Gerçekten okundu işaretlenen satır sayısı. */
  markedCount: number;
}

/**
 * Oyuncunun TÜM okunmamış bildirimlerini okundu işaretler.
 * `POST /players/:id/notifications/read-all`.
 *
 * **Akış TEK ADIMDIR — "önce oku, sonra yaz" YOK.** Tek bildirimlik uç
 * noktanın aksine burada "yok" durumu diye bir şey yoktur: hiç okunmamış
 * bildirimi olmayan bir oyuncu da 200 alır (`markedCount: 0`). Bu yüzden
 * `markAllRead`in döndürdüğü satır sayısı doğrudan sonuçtur.
 *
 * **NEDEN `markedCount` DÖNER (204 yerine):** `RemoveFriendResult` ile AYNI
 * gerekçe — istemcinin `request()` yardımcısı HER ZAMAN `response.json()`
 * çağırır, yani gövdesiz bir yanıt istemcide hata üretir. Ayrıca sayı,
 * istemciye "rozeti kaça düşüreyim" sorusunun cevabını verir: yarış
 * koşulunda arada gelen bir bildirim rozeti 0 yapmamalıdır.
 */
@Injectable()
export class MarkAllNotificationsReadUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly notificationRepository: NotificationRepository,
  ) {}

  async execute(playerId: string): Promise<MarkAllNotificationsReadResult> {
    const markedCount = await this.notificationRepository.markAllRead(playerId, new Date());
    return { markedCount };
  }
}
