import type { NotificationView, RaceInviteView } from '@at-sevdalisi/shared-types';

/**
 * `NotificationNotifier` — Application katmanının realtime bildirim
 * yayını için gördüğü port (brief §28, §42 PHASE 11).
 *
 * `LobbyNotifier` (`application/ports/lobby-notifier.ts`) ile AYNI desen ve
 * AYNI gerekçe: Application katmanı Socket.IO BİLMEZ (CLAUDE.md "KATMAN
 * YÖNÜ TEK YÖNLÜ"). Use-case yalnızca "şu oyuncuya şunu bildir" der;
 * hangi gateway'in, hangi odaya, hangi olay adıyla yayacağı
 * Infrastructure/API katmanının kararıdır (`RaceGateway`).
 *
 * **NEDEN `void` DÖNER (Promise DEĞİL):** yayın, isteğin başarısını
 * ETKİLEMEZ. Bildirim satırı zaten transaction'da yazılmıştır; soket
 * kopuksa oyuncu bildirimi bir sonraki `GET /players/:id/notifications`
 * çağrısında görür. `await` etmek, kopuk bir soketin HTTP yanıtını
 * geciktirmesi (ya da düşürmesi) anlamına gelirdi — `notifyMatchFound`
 * ile AYNI karar.
 */
export interface NotificationNotifier {
  /**
   * Oyuncunun KENDİ odasına (`player:<id>`) taze bir bildirim yayar.
   * Alıcı: bildirimin sahibi.
   */
  notifyNotification(playerId: string, notification: NotificationView): void;

  /**
   * Davet EDİLENE daveti yayar (aynı odaya, ayrı olay adıyla).
   *
   * **NEDEN `notification.created` YETMİYOR:** bildirim listesi genel bir
   * akıştır; davet ise iki düğmeli ([JOIN]/[DECLINE]) bir KARTTIR ve
   * istemcinin onu anında, liste yenilenmeden göstermesi gerekir. İkisi
   * ayrı olay olarak yayılır çünkü istemcide iki AYRI tüketici vardır
   * (rozet sayacı ↔ davet kartı).
   */
  notifyRaceInvite(inviteeId: string, invite: RaceInviteView): void;

  /**
   * Daveti KABUL/DECLINE edeni DEĞİL, davet EDENİ bilgilendirir — davet
   * eden kendi ekranında bekleyen daveti görüyordur ve sonucu öğrenmelidir.
   *
   * Bu bir BİLDİRİM SATIRI üretmez (brief §28'in sekiz türü arasında
   * "davetim yanıtlandı" yoktur — bkz. `RaceInviteRepository.respond` doc
   * yorumu); yalnızca açık bir sekmenin anında güncellenmesi içindir.
   */
  notifyRaceInviteResponded(inviterId: string, invite: RaceInviteView): void;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const NOTIFICATION_NOTIFIER = Symbol('NOTIFICATION_NOTIFIER');
