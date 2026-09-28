/**
 * `notification.created` / `race.invite` / `race.invite.responded` frontend
 * entegrasyonu (28.09.2026) — `race.gateway.ts`'in ZATEN var olan `/races`
 * namespace'ine (`lobby-socket.ts`/`live-race-socket.ts` ile AYNI bağlantı ve
 * kimlik doğrulama deseni) bağlanan ince bir sarmalayıcı.
 *
 * **`race.subscribe` YOLLANMAZ — ve bu bir eksiklik DEĞİL, sözleşmenin
 * kendisidir.** `RaceGateway.handleConnection`, token doğrulandıktan HEMEN
 * sonra HER istemciyi kendi oyuncu-bazlı odasına (`player:${playerId}`)
 * otomatik katar. Üç olay da O ODAYA yayınlanır (bkz. `notifyNotification`
 * doc yorumu), yani bağlantının KENDİSİ yeterlidir — `race.subscribe`
 * çağırmak "bir yarışı izlemeye başlamak" olurdu ve burada istenen şey o
 * değildir.
 *
 * **BEST-EFFORT'TUR.** Bu soket bağlı değilken üretilen bildirim KAYBOLMAZ:
 * satır ZATEN veritabanına yazılmıştır ve sayfa açılışında
 * `GET /players/:id/notifications` ile gelir. Bu yüzden burada yeniden
 * bağlanma/kuyruk mantığı YAZILMAZ — `socket.io-client`'ın kendi otomatik
 * yeniden bağlanması yeterlidir ve o da olmasa ekran yalnızca "canlı
 * güncellenmiyor" durumuna düşer, YANLIŞ bir şey göstermez.
 *
 * `socket.io-client`'a bağımlı olduğundan (`lobby-socket.ts` ile AYNI kısıt),
 * bu dosya da yerel sandbox'ta gerçek bir bağlantıyla doğrulanamaz —
 * doğrulama CI'dadır.
 */

import { io, type Socket } from 'socket.io-client';
import type { NotificationView, RaceInviteView } from '@at-sevdalisi/shared-types';
import { deriveSocketOrigin } from '../race-viewer/live-race-url';

export interface NotificationSocketHandlers {
  /** `notification.created` — rozet sayacı ve liste tüketicisi (ALICI: bildirimin sahibi). */
  onNotification: (notification: NotificationView) => void;
  /** `race.invite` — ALICI: davet EDİLEN. İki düğmeli kart bunu dinler. */
  onRaceInvite: (invite: RaceInviteView) => void;
  /**
   * `race.invite.responded` — ALICI: davet EDEN. Yani farklı bir olay,
   * farklı bir istemciye gider: davet eden kendi bekleyen davetini
   * ekranında görüyordur ve sonucu öğrenmelidir.
   */
  onRaceInviteResponded: (invite: RaceInviteView) => void;
  /** Bağlantı HİÇ kurulamadı (auth reddi, ilk el sıkışma ağ hatası). */
  onConnectError: (message: string) => void;
}

/**
 * Dönen `Socket`'in `disconnect()`'i, çağıran tarafın (`notifications/page.tsx`)
 * `useEffect` temizliğinde çağrılması BEKLENİR — bu fonksiyon kendi başına
 * bir yaşam döngüsü YÖNETMEZ (`connectLobbySocket` ile AYNI sözleşme).
 */
export function connectNotificationSocket(
  apiBaseUrl: string,
  token: string,
  handlers: NotificationSocketHandlers,
): Socket {
  const socket = io(`${deriveSocketOrigin(apiBaseUrl)}/races`, {
    auth: { token },
    transports: ['websocket'],
  });

  socket.on('connect_error', (error: Error) => {
    handlers.onConnectError(error.message);
  });

  socket.on('notification.created', (notification: NotificationView) => {
    handlers.onNotification(notification);
  });

  socket.on('race.invite', (invite: RaceInviteView) => {
    handlers.onRaceInvite(invite);
  });

  socket.on('race.invite.responded', (invite: RaceInviteView) => {
    handlers.onRaceInviteResponded(invite);
  });

  return socket;
}
