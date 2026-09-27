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
   * **Dönüş tipi `WatchableRaceFacts`tir (`WatchableRaceView` DEĞİL):**
   * `ticketPrice` bir VERİTABANI olgusu değil, `config/grandstand.config.json`
   * değeridir. Repository'nin onu uydurması (ör. `0` yazıp use-case'in
   * üzerine yazmasını ummak) sessiz bir "bedava bilet" hatası riski
   * taşırdı; `Omit` ile alanı bu katmandan TAMAMEN çıkarmak o riski
   * yapısal olarak ortadan kaldırır — eksik bırakılırsa DERLEME hatası verir.
   */
  findWatchableRaces(viewerId: string, windowHours: number, limit: number): Promise<WatchableRaceFacts[]>;

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
   * **PARA YOLU.** Bileti satın alır: `players` satırını `SELECT ... FOR
   * UPDATE` ile KİLİTLER, `debit` (saf domain fonksiyonu —
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
   * Oyuncu satırı YOKSA `null` döner (çağıran `PlayerNotFoundError`'a
   * çevirir).
   */
  purchaseTicket(input: PurchaseTicketInput): Promise<PurchaseTicketResult | null>;
}

/**
 * `GrandstandRepository.findWatchableRaces` satırı — `WatchableRaceView`'in
 * `ticketPrice` alanı ÇIKARILMIŞ hâli (bkz. port metodunun doc yorumu).
 * `ListWatchableRacesUseCase` bu satırlara config'ten gelen fiyatı ekleyip
 * API sınırının tipini (`WatchableRaceView`) üretir.
 */
export type WatchableRaceFacts = Omit<WatchableRaceView, 'ticketPrice'>;

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
}

/** `GrandstandRepository.purchaseTicket` girdisi. */
export interface PurchaseTicketInput {
  playerId: string;
  raceId: string;
  /** `config/grandstand.config.json` → `ticketPrice.amount` (domain tarafından doğrulanmış). */
  price: number;
  currency: Currency;
  /**
   * `Idempotency-Key` header'ı — `ExecuteMarketPurchaseInput.idempotencyKey`
   * ile AYNI desen: interceptor handler'a header'ı ENJEKTE ETMEZ, controller
   * `@Headers('Idempotency-Key')` ile okuyup use-case'e geçirir, use-case
   * buraya taşır. Böylece defter satırı, isteği tekrarlayan istemcinin
   * anahtarıyla GERİYE DÖNÜK izlenebilir olur.
   */
  idempotencyKey: string | null;
}

/** `GrandstandRepository.purchaseTicket` sonucu — `SavePracticeRaceWithStakesResult` ile AYNI şekil. */
export interface PurchaseTicketResult {
  ticketId: string;
  purchasedAt: Date;
  money: number;
  gems: number;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const GRANDSTAND_REPOSITORY = Symbol('GRANDSTAND_REPOSITORY');
