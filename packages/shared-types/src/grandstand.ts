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
   * Bu yarışın bilet fiyatı — **`races.tribune_fee`** (PHASE 7.1,
   * 29.09.2026). Sunucu tarafından gönderilir; istemci fiyatı KENDİ
   * hesaplamaz veya varsaymaz (sunucu otoritesi ilkesi).
   *
   * **KAYNAK DEĞİŞTİ.** 27.09.2026 – 29.09.2026 arasında bu alan
   * `config/grandstand.config.json → ticketPrice`'tan geliyordu ve
   * `races.tribune_fee` sütunu **hiç okunmuyordu** (ölü sütun). Artık tek
   * doğruluk kaynağı satırdır: yarışı açan oyuncunun seçtiği ücret ne ise
   * (`race-lobby.config.json → tribuneFeeOptions`) satın alma fiyatı
   * odur. Config'teki değer yalnızca **oluşturma anındaki varsayılan**
   * (`defaultTribuneFee`) olarak yaşar.
   *
   * `amount === 0` ise bu yarışın tribünü **ücretsizdir**: izlemek için
   * bilet gerekmez ve `POST /races/:id/tickets` 409 `RACE_TRIBUNE_FREE`
   * döner. İstemci bu satırda "Bilet Al" yerine doğrudan "İzle"
   * göstermelidir.
   */
  ticketPrice: { currency: Currency; amount: number };
  /**
   * Bu yarışın tribün kapasitesi (`races.spectator_capacity`). PHASE 7.1
   * ile **gerçekten uygulanır**: satılan bilet sayısı bu sayıya ulaşınca
   * yeni bilet 409 `RACE_TRIBUNE_FULL` ile reddedilir.
   */
  spectatorCapacity: number;
  /**
   * Şu ana kadar satılan bilet sayısı (`count(*) FROM race_tickets`).
   * İstemci "kaç koltuk kaldı" göstergesini `spectatorCapacity -
   * ticketsSold` ile üretir — ama kararı SUNUCU verir; bu sayı yalnızca
   * GÖSTERİM içindir (sunucu otoritesi ilkesi).
   */
  ticketsSold: number;
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
  /**
   * 30.09.2026 (migration 0044) — yarışın bu bilet sayesinde İLK izlendiği
   * an. `null` = hiç izlenmedi → iade edilebilir; dolu = kullanıldı →
   * `DELETE /races/:id/tickets` 409 `TICKET_ALREADY_USED` döner.
   */
  usedAt: ISODateTimeString | null;
}

/**
 * `DELETE /races/:id/tickets` yanıtı — bilet iadesi (PHASE 7.2,
 * 29.09.2026).
 *
 * `refundedAmount` İADE EDİLEN tutardır ve **bilet satırının kendi
 * `price`'ından** okunur, `races.tribune_fee`den DEĞİL — yarışın ücreti
 * sonradan değişse bile geçmiş bir satın alma kendi tutarını korur
 * (yarış iptalindeki "iade tutarı DEFTERDEN okunur" kuralının AYNISI,
 * `PROJE_DURUMU.md` §13.19).
 *
 * `newBalance` `RaceTicketPurchaseResult` ile AYNI `Pick<Player, ...>`
 * desenidir: istemci yeni bakiyeyi KENDİ hesaplamaz.
 */
export interface RaceTicketRefundResult {
  ticketId: UUID;
  raceId: UUID;
  refundedAmount: number;
  currency: Currency;
  newBalance: Pick<Player, 'money' | 'gems'>;
}
