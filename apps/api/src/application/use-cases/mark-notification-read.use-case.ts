import { Inject, Injectable } from '@nestjs/common';
import type { NotificationView } from '@at-sevdalisi/shared-types';
import { NotificationNotFoundError } from '../../domain/social/errors';
import { NOTIFICATION_REPOSITORY, type NotificationRepository } from '../ports/notification.repository';
import { toNotificationView } from './notification.mapper';

/**
 * Tek bildirimi okundu işaretler.
 * `POST /players/:id/notifications/:notificationId/read`.
 *
 * **Akış:**
 *   1. ÖNCE satır okunur — iki farklı durumu AYIRT EDEBİLMEK için:
 *      "böyle bir bildirim yok / benim değil" (404) ile "zaten okunmuş"
 *      (200, DEĞİŞİKLİK YOK).
 *   2. `markRead` çağrılır. `null` dönerse satır bu arada okunmuş ya da
 *      silinmiştir — bu bir HATA DEĞİLDİR: uç nokta idempotenttir, istemci
 *      aynı bildirime iki kez tıklayabilir.
 *
 * **NEDEN 1. ADIM GEREKLİ (doğrudan `markRead` + `null` → 404 yetmezdi):**
 * o tasarımda zaten okunmuş bir bildirim 404 dönerdi ve istemci "bu
 * bildirim kaybolmuş" diye düşünürdü. Oysa gerçek 404 (başkasının
 * bildirimi) ile "zaten okundu" AYRI şeylerdir.
 *
 * **BU BİR YETKİ KONTROLÜ DEĞİLDİR:** "bu bildirim bana mı ait" sorusu
 * `player_id` filtresiyle SQL'de cevaplanır (`markRead`in `WHERE`i) ve
 * `assertSelf` controller'da `:id`yi doğrular. Use-case yalnızca "kim
 * soruyor"u değil, "bu satır kime ait"i görür.
 */
@Injectable()
export class MarkNotificationReadUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly notificationRepository: NotificationRepository,
  ) {}

  async execute(playerId: string, notificationId: string): Promise<NotificationView> {
    const existing = await this.notificationRepository.findById(playerId, notificationId);
    if (existing === null) {
      throw new NotificationNotFoundError(notificationId);
    }

    const updated = await this.notificationRepository.markRead(playerId, notificationId, new Date());
    // Satır bu arada okunmuş olabilir (`markRead`in `read_at IS NULL`
    // koşulu). O durumda elimizdeki kopya DÖNER — istemci için sonuç
    // aynıdır: bildirim okunmuş durumdadır.
    return toNotificationView(updated ?? existing);
  }
}
