import type { ISODateTimeString, UUID } from './common';
import type { Currency } from './currency';
import type { Player } from './player';
import type { RaceSurface } from './race';

/**
 * Tribün (grandstand) — proje sahibinin açık talebi (27.09.2026):
 * "yarış yapılan yerlerde tribüne ücretli girişler olsun insanlar yarışları
 * izleyebilsin".
 *
 * **Neden gerekli:** Bugüne kadar `GET /races/:id/timeline` (ve aynı
 * yetkilendirmeyi kullanan `race.subscribe` soket olayı) YALNIZCA o yarışa
 * atıyla katılmış oyunculara açıktı (`GetRaceTimelineUseCase` →
 * `isPlayerParticipant` → 403). Bu dilim o kapıya ikinci bir meşru
 * gerekçe ekler: "bu yarış için BİLET ALDIM".
 *
 * **Bilet = izleme yetkisi.** Katılım DEĞİLDİR: yarış sonucunu, sıralamayı,
 * ödülü veya envanteri ETKİLEMEZ (sunucu otoritesi ilkesi, `CLAUDE.md`).
 */

/**
 * `GET /races/watchable` yanıtının bir satırı — "şu an tribünden
 * izlenebilecek bir yarış".
 *
 * Listeye girmenin ÜÇ koşulu vardır (bkz.
 * `PostgresGrandstandRepository.findWatchableRaces`):
 *   1. `races.status = 'finished'` — devam eden/bekleyen yarış izlenemez.
 *   2. `races.created_at` izleme penceresinin (`watchWindowHours`) içinde.
 *   3. İstek sahibinin o yarışta ATI YOK — kendi yarışı "izlenecek" bir şey
 *      değildir, zaten katılımcı olarak erişebilir.
 */
export interface WatchableRaceView {
  raceId: UUID;
  raceName: string;
  distanceMeters: number;
  surface: RaceSurface;
  /**
   * Kaç katılımcı koştu (gerçek atlar + botlar). Bilet satın alma kararında
   * "kaç atlı bir yarışı izliyorum" bilgisini verir — yarış sonucu DEĞİL,
   * yalnızca alan büyüklüğüdür.
   */
  entrantCount: number;
  /** Bu yarışın giriş ücreti (`races.entry_fee`) — izleyiciye bağlam bilgisi, ödeme DEĞİL. */
  entryFee: number;
  /** Bu yarışta dağıtılan toplam ödül havuzu (`races.prize_pool`). */
  prizePool: number;
  finishedAt: ISODateTimeString;
  /**
   * İstek sahibinin bu yarış için ZATEN bileti var mı? `true` ise istemci
   * "Bilet Al" yerine "İzle" gösterir — ayrı bir sorgu GEREKMEZ.
   */
  hasTicket: boolean;
  /**
   * Bilet fiyatı (`config/grandstand.config.json` → `ticketPrice`). Sunucu
   * tarafından gönderilir; istemci fiyatı KENDİ hesaplamaz veya
   * varsaymaz (sunucu otoritesi ilkesi).
   */
  ticketPrice: { currency: Currency; amount: number };
}

/**
 * `POST /races/:id/tickets` yanıtı.
 *
 * `newBalance` `ClaimDailyRewardResult`/`StableUpgradeResult` ile AYNI
 * `Pick<Player, 'money' | 'gems'>` desenidir — istemci yeni bakiyeyi
 * KENDİ hesaplamaz, sunucudan okur.
 */
export interface RaceTicketPurchaseResult {
  ticketId: UUID;
  raceId: UUID;
  price: number;
  currency: Currency;
  purchasedAt: ISODateTimeString;
  newBalance: Pick<Player, 'money' | 'gems'>;
}

/**
 * `GET /players/:id/tickets` yanıtının bir satırı — oyuncunun geçmiş/
 * mevcut biletleri. `raceName`/`finishedAt`, kullanıcı "hangi yarıştı"
 * sorusunu cevaplayabilsin diye JOIN ile gelir.
 */
export interface RaceTicketView {
  ticketId: UUID;
  raceId: UUID;
  raceName: string;
  price: number;
  currency: Currency;
  purchasedAt: ISODateTimeString;
  finishedAt: ISODateTimeString;
}
