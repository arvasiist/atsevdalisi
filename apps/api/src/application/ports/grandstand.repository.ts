import type { RaceTicketView, WatchableRaceView } from '@at-sevdalisi/shared-types';
import type { Currency } from '../../domain/economy/wallet';

/**
 * `GrandstandRepository` — Tribün (ücretli seyirci girişi) diliminin
 * Application → Infrastructure portu. Diğer repository port'larıyla AYNI
 * desen (docs/ARCHITECTURE.md §4): bu arayüz HTTP/NestJS bilmez, yalnızca
 * "ne yapılabilir" sorusunu tanımlar.
 *
 * **Neden ayrı bir port (`RaceRepository`'ye metot eklemek yerine):**
 * `RaceRepository` yarışın KENDİSİNİN (sonuç, segment, katılım) portudur;
 * bilet ise katılımdan TAMAMEN AYRI bir olgudur (bkz. migration 0032'nin
 * "NEDEN AYRI TABLO" notu). Ayrıca `GetRaceTimelineUseCase` yalnızca
 * `hasTicket`'e ihtiyaç duyar — ona tüm `RaceRepository`'yi zaten
 * enjekte etmiş durumdayız, ama bilet sorgusunu oraya karıştırmak iki
 * farklı sorumluluğu tek arayüzde birleştirirdi.
 */
export interface GrandstandRepository {
  /**
   * İstek sahibinin tribünden izleyebileceği yarışları döner — "kendi
   * yarışları HARİÇ, son `windowHours` saat içinde bitmiş yarışlar",
   * en yeniden eskiye. Her satır, istek sahibinin o yarış için ZATEN
   * bileti olup olmadığını da taşır (`hasTicket`) — istemci ikinci bir
   * sorgu yapmak zorunda kalmaz.
   *
   * Salt okunur, `withTransaction` GEREKMEZ (`findRecentResultsByOwnerId`
   * ile AYNI gerekçe).
   *
   * **`ticketPrice` ARTIK BİR VERİTABANI OLGUSUDUR** (PHASE 7.1,
   * 29.09.2026). 27.09.2026'dan beri bu alan config'ten geliyordu ve
   * `races.tribune_fee` sütunu ölüydü; artık fiyat satırdan okunur. Bu
   * yüzden dönüş tipi `WatchableRaceFacts` DEĞİL, doğrudan
   * `WatchableRaceView`dir — aradaki `Omit` hilesi (fiyatı bu katmandan
   * çıkarıp use-case'te eklemek) kaldırıldı, çünkü koruduğu risk
   * ("repository uydurma bir fiyat yazar") ortadan kalktı: fiyatın tek
   * kaynağı artık sorgunun kendisidir.
   */
  findWatchableRaces(viewerId: string, windowHours: number, limit: number): Promise<WatchableRaceView[]>;

  /**
   * Oyuncunun satın aldığı biletler (en yeniden eskiye) — "Biletlerim"
   * ekranı. Salt okunur.
   */
  findTicketsByPlayerId(playerId: string, limit: number): Promise<RaceTicketView[]>;

  /**
   * `raceId` için `playerId`'nin bileti var mı? `GetRaceTimelineUseCase`'in
   * yetkilendirme kapısı ve `PurchaseRaceTicketUseCase`'in "zaten biletin
   * var" ön kontrolü BU metodu kullanır. Salt okunur.
   */
  hasTicket(raceId: string, playerId: string): Promise<boolean>;

  /**
   * Bilet satın alma öncesi ihtiyaç duyulan yarış olguları. Yarış YOKSA
   * `null` döner (çağıran `RaceNotFoundError`'a çevirir — bu port HTTP/
   * domain hatası BİLMEZ).
   *
   * `isOwnRace`, "istek sahibinin bu yarışta EN AZ bir gerçek atı var mı"
   * sorusunun cevabıdır — `RaceRepository.isPlayerParticipant` ile AYNI
   * sorgu şekli ama AYNI transaction'da okunur (ikinci bir gidiş-dönüş
   * gerekmez).
   */
  findRaceWatchability(raceId: string, viewerId: string): Promise<RaceWatchabilityFacts | null>;

  /**
   * `GetRaceTimelineUseCase`'in yetki kapısının ihtiyaç duyduğu TEK satır
   * (PHASE 7.1, 29.09.2026): "bu yarışın tribünü ücretli mi" +
   * "istek sahibinin bileti var mı". Yarış YOKSA `null` döner (çağıran
   * `RaceNotFoundError`'a çevirir).
   *
   * **Neden `hasTicket` YETMEDİ:** `races.tribune_fee = 0` olan bir yarışın
   * tribünü ücretsizdir ve izlemek için bilet GEREKMEZ
   * (`canWatchRaceWithoutTicket`). Yalnızca `hasTicket`'e bakan bir kapı,
   * ücretsiz tribünlü yarışı **kimseye açmaz** — ne katılımcı olmayan
   * izleyiciye ne bilet almaya çalışana (o yolda 409 döner). İki alan TEK
   * sorguda gelir ki kapı tek bir okumadan karar versin.
   *
   * Salt okunur, `withTransaction` GEREKMEZ.
   */
  getTribuneAccess(raceId: string, viewerId: string): Promise<TribuneAccessFacts | null>;

  /**
   * **PARA YOLU.** Bileti satın alır: `races` ve `players` satırlarını
   * `SELECT ... FOR UPDATE` ile KİLİTLER, KONTENJANI kilit altında
   * doğrular (`TribuneFullError`), tutarı **kilitli yarış satırından**
   * (`races.tribune_fee`) okur, `debit` (saf domain fonksiyonu —
   * `InsufficientFundsError` fırlatabilir) ile bakiyeyi düşer, `players`
   * satırını günceller, `race_tickets` satırını ekler VE
   * `economy_transactions`'a defter kaydını yazar — HEPSİ TEK bir Postgres
   * transaction'ında.
   *
   * Bu metot `PlayerRepository`'yi HİÇ KULLANMAZ, kendi transaction'ını
   * yönetir — `PostgresMarketPurchaseRepository.executePurchase` ve
   * `PostgresRaceRepository.savePracticeRaceWithStakes` ile AYNI desen
   * (bkz. `RaceRepository.savePracticeRaceWithStakes` port doc yorumundaki
   * E1 gerekçesi: ayrı transaction'lar "para gitti ama kayıt yok"
   * durumuna yol açabiliyordu).
   *
   * **KİLİT SIRASI `races` → `players`** (PHASE 7.1). Bu sıra İCAT
   * EDİLMEDİ: `PostgresRaceRepository.settleLobbyRace`/`lockLobbyRace` de
   * aynı sırayla kilitler (`races` FOR UPDATE, sonra oyuncular toplu
   * `ORDER BY id FOR UPDATE`). Ters sıra, eşzamanlı bir kesinleştirme ile
   * bu satın alma arasında **kilit döngüsü** (deadlock) doğururdu ve
   * Postgres bunu rastgele bir tarafta 40P01 ile keserdi — yani hata
   * KARARSIZ olurdu.
   *
   * Oyuncu satırı YOKSA `null` döner (çağıran `PlayerNotFoundError`'a
   * çevirir).
   */
  purchaseTicket(input: PurchaseTicketInput): Promise<PurchaseTicketResult | null>;

  /**
   * **PARA YOLU (ters yön).** Bileti iade eder (PHASE 7.2, 29.09.2026):
   * `race_tickets` satırını `DELETE ... RETURNING` ile SİLER, `players`
   * satırını `FOR UPDATE` ile kilitleyip `credit` ile bakiyeyi artırır ve
   * `economy_transactions`'a POZİTİF bir `grandstand_ticket_refund`
   * satırı yazar — HEPSİ TEK transaction'da.
   *
   * **İade tutarı BİLET SATIRININ `price`'ından** okunur
   * (`races.tribune_fee`den DEĞİL): yarışın ücreti sonradan değişse bile
   * geçmiş bir satın alma kendi tutarını korur. Aynı kural yarış
   * iptalinde de geçerlidir (`PROJE_DURUMU.md` §13.19) — orada da tutar
   * defterden okunur, `races.entry_fee` sabitinden değil.
   *
   * **Satırın SİLİNMESİ bilinçlidir** (yarış iptalindeki `race_entries`in
   * AKSİNE, orada `cancelled` işaretlenir): orada silmek aynı oyuncunun
   * bedava yeniden katılmasına kapı açardı; burada ise parasını geri alan
   * oyuncunun yeniden bilet alması MEŞRUDUR ve tam olarak beklenen akıştır.
   * Çift iadeyi engelleyen şey `DELETE ... RETURNING`in 0 satır
   * döndürmesidir — bu yüzden `null` dönüş çağıranda
   * `RaceTicketNotFoundError`a (404) çevrilir.
   *
   * **Kilit sırası `players` → `race_tickets`**: `purchaseTicket`ın
   * `races` → `players` sırasıyla çakışmaz (refund `races` satırına hiç
   * dokunmaz), yani döngü kurulamaz.
   *
   * **`null` YALNIZCA "bilet yok" demektir** (çağıran
   * `RaceTicketNotFoundError` → 404). `purchaseTicket`ın `null`u "oyuncu
   * yok" iken burada farklıdır — bilinçli: çağıran use-case oyuncunun
   * varlığını ZATEN doğrular (`PlayerNotFoundError`), yani buraya
   * geldiğinde oyuncunun yokluğu beklenmedik bir durumdur ve **sessiz bir
   * 404'e dönüşmemelidir** (var olan bir oyuncuya "biletin yok" demek
   * yanlış teşhis olurdu). Oyuncu satırı bulunamazsa repository AÇIKÇA
   * fırlatır.
   */
  refundTicket(input: RefundTicketInput): Promise<RefundTicketResult | null>;
}

/** `GrandstandRepository.findRaceWatchability` sonucu — `domain/grandstand/ticket.ts`'in `RaceWatchabilityInput`'unun veritabanı tarafı. */
export interface RaceWatchabilityFacts {
  raceId: string;
  raceName: string;
  /** `races.status = 'finished'` mi? */
  isFinished: boolean;
  /** `races.created_at` (ms) — yarış sunucuda ANINDA tamamlandığı için bitiş anıyla aynıdır. */
  finishedAtMs: number;
  /** İstek sahibinin bu yarışta gerçek (bot olmayan) atı var mı? */
  isOwnRace: boolean;
  /**
   * `races.tribune_fee` — bu yarışın bilet fiyatı (PHASE 7.1). `0` ise
   * tribün ücretsizdir ve satın alma `RaceTribuneFreeError` ile reddedilir.
   */
  tribuneFee: number;
}

/**
 * `GrandstandRepository.getTribuneAccess` sonucu — `GetRaceTimelineUseCase`
 * yetki kapısının TEK okuması (PHASE 7.1).
 */
export interface TribuneAccessFacts {
  /** `races.tribune_fee` — `0` ise bilet GEREKMEZ. */
  tribuneFee: number;
  /** İstek sahibinin bu yarış için bileti var mı? */
  hasTicket: boolean;
}

/**
 * `GrandstandRepository.purchaseTicket` girdisi.
 *
 * **`price`/`currency` BİLEREK YOKTUR (PHASE 7.1).** 27.09.2026'da use-case
 * config'teki fiyatı buraya geçiriyordu; şimdi tutar `races.tribune_fee`,
 * para birimi ise config'in tek tribün birimidir ve **ikisini de
 * repository kilit altında kendisi okur**. Çağıranın geçirdiği bir tutar
 * ile kilit altında okunan tutar ayrışabilirdi (araya giren bir güncelleme
 * ya da iki ayrı okuma) ve o zaman **tahsil edilen** para ile yanıtta
 * **gösterilen** ve deftere yazılan para farklı olurdu — hiçbir yerde hata
 * üretmeden. Tutarın tek kaynağı kilitli satırdır; sonuç
 * (`PurchaseTicketResult.price`) gerçekte tahsil edileni geri taşır.
 */
export interface PurchaseTicketInput {
  playerId: string;
  raceId: string;
  /**
   * `Idempotency-Key` header'ı — `ExecuteMarketPurchaseInput.idempotencyKey`
   * ile AYNI desen: interceptor handler'a header'ı ENJEKTE ETMEZ, controller
   * `@Headers('Idempotency-Key')` ile okuyup use-case'e geçirir, use-case
   * buraya taşır. Böylece defter satırı, isteği tekrarlayan istemcinin
   * anahtarıyla GERİYE DÖNÜK izlenebilir olur.
   */
  idempotencyKey: string | null;
}

/**
 * `GrandstandRepository.purchaseTicket` sonucu — `SavePracticeRaceWithStakesResult`
 * ile AYNI şekil, artı `price`/`currency`.
 *
 * **`price` SONUCA eklendi (PHASE 7.1)** çünkü tutarı artık repository
 * okuyor: yanıtın "şu kadar ödedin" demesi ile deftere yazılan tutarın
 * ayrışmaması için tutar buradan geri taşınır.
 */
export interface PurchaseTicketResult {
  ticketId: string;
  purchasedAt: Date;
  price: number;
  currency: Currency;
  money: number;
  gems: number;
}

/** `GrandstandRepository.refundTicket` girdisi. */
export interface RefundTicketInput {
  playerId: string;
  raceId: string;
  /**
   * `Idempotency-Key` header'ı — defter satırı bu anahtarı taşır, böylece
   * iade GERİYE DÖNÜK izlenebilir olur (`purchaseTicket` ile AYNI desen).
   */
  idempotencyKey: string | null;
}

/** `GrandstandRepository.refundTicket` sonucu. */
export interface RefundTicketResult {
  ticketId: string;
  refundedAmount: number;
  currency: Currency;
  money: number;
  gems: number;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const GRANDSTAND_REPOSITORY = Symbol('GRANDSTAND_REPOSITORY');
