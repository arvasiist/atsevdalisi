import type { Player } from '@at-sevdalisi/shared-types';
import type { EconomyLedgerEntryInput } from './economy-ledger';

/**
 * `PlayerRepository` — Application katmanının Infrastructure'a bağlandığı
 * PORT (interface). Bkz. docs/ARCHITECTURE.md §4: "Application ...
 * Infrastructure'a arayüzler (interface/port) üzerinden bağlanır."
 *
 * Application katmanı bu interface'i KULLANIR ama İMPLEMENTE ETMEZ —
 * gerçek implementasyon `infrastructure/player/postgres-player.repository.ts`
 * dosyasındadır ve `PlayerModule`'de bu token'a bağlanır (bkz.
 * `api/player/player.module.ts`). Bu ayrım, ileride PostgreSQL yerine
 * başka bir depolama kullanılmak istenirse (veya testte sahte/in-memory bir
 * implementasyon geçirmek istenirse) Application/Domain katmanlarının hiç
 * değişmemesini sağlar.
 */
export interface PlayerRepository {
  findById(id: string): Promise<Player | null>;
  findByUsername(username: string): Promise<Player | null>;
  /** Yeni bir oyuncu kaydı ekler. Var olan bir `id`'yi GÜNCELLEMEZ. */
  save(player: Player): Promise<void>;
  /**
   * FAZ 1 wiring, altıncı dilim — Ahır Yükseltme (brief §32) (ve yedinci
   * dilimde Günlük Ödül, brief §37, AYNI deseni tekrar kullanır) — para/mülkiyet
   * değiştiren İLK use-case, bu yüzden docs/SECURITY.md §5'in ("SELECT ...
   * FOR UPDATE" + tek transaction) İLK gerçek uygulaması.
   *
   * Oyuncu satırını KİLİTLEYEREK okur (`FOR UPDATE`), `mutate` callback'ini
   * güncel/kilitli `Player` ile çağırır; callback'in döndürdüğü YENİ
   * `Player` AYNI transaction içinde, satır hâlâ kilitliyken yazılır —
   * böylece iki eşzamanlı istek (örn. çift tıklama) aynı bakiyeyi iki kez
   * harcayamaz (docs/SECURITY.md §5'in tam olarak önlemek istediği durum).
   *
   * `mutate` İÇİNDE bir domain hatası fırlatılırsa (örn.
   * `InsufficientFundsError`, `MaxStableLevelReachedError`) transaction
   * ROLLBACK olur, hiçbir şey yazılmaz, hata olduğu gibi yukarı fırlatılır.
   * Oyuncu bulunamazsa `mutate` hiç ÇAĞRILMAZ, `null` döner (çağıran
   * `PlayerNotFoundError` fırlatır).
   *
   * Domain hesaplaması (örn. `wallet.debit`) BİLEREK bu callback'in
   * İÇİNDE çalışır — satır kilitliyken okunan `player` en güncel/authoritative
   * değerdir; callback'in DIŞINDA (örn. önce ayrı bir `findById` ile) okunan
   * bir değer STALE olabilir ve çift harcamaya açık kapı bırakır.
   *
   * AUDIT_AND_HARDENING Öncelik 2 (bu oturum) — `mutate` isteğe bağlı
   * olarak `ledgerEntries` döndürebilir: bu girişler, oyuncu satırının
   * YAZILMASIYLA AYNI transaction içinde `economy_transactions`'a
   * eklenir (bkz. `PostgresPlayerRepository`'nin implementasyonu) — para
   * hareketi ile onun defter kaydı ASLA birbirinden ayrı yazılmaz (biri
   * başarısız olursa ikisi de geri alınır). Para HAREKETİ üretmeyen
   * `mutate` çağrıları (örn. sadece `displayName` güncelleyen bir
   * gelecekteki use-case) bu alanı hiç DÖNDÜRMEZ/boş bırakır.
   */
  updateWithLock<T>(
    id: string,
    mutate: (player: Player) => { player: Player; result: T; ledgerEntries?: EconomyLedgerEntryInput[] },
  ): Promise<T | null>;

  /**
   * FAZ 1 wiring, on birinci dilim — At Pazarı satın alma (brief §30/§31).
   * `updateWithLock` ile AYNI "kilitle → mutate çalıştır → AYNI transaction'da
   * yaz" deseni, ama İKİ TARAF için (alıcı + satıcı arasında `wallet.transfer`,
   * bu projenin PARA değiştiren İLK ÇOK-taraflı use-case'i — Ahır
   * Yükseltme/Günlük Ödül/Pratik Yarış'ın hepsi TEK oyuncunun kendi
   * bakiyesini değiştiriyordu).
   *
   * Deadlock'u önlemek için satırlar implementasyon içinde HER ZAMAN
   * id'lerin sözlüksel sırasına göre kilitlenir (iki oyuncunun AYNI ANDA
   * birbirinden bir şey satın almaya çalışması gibi nadir bir senaryoda
   * bile iki transaction'ın birbirini karşılıklı beklememesi için) — ama
   * `mutate` çağırana HER ZAMAN `buyerId` önce olacak şekilde çağrılır,
   * böylece çağıran kilit sırasıyla hiç UĞRAŞMAZ.
   *
   * `buyerId` bulunamazsa `null` döner (`updateWithLock` ile AYNI
   * sözleşme — geçersiz bir alıcı id'si gerçek/test edilebilir bir
   * senaryodur). `sellerId` bulunamazsa (bu, `market_listings.seller_id`'nin
   * `players(id)` üzerinde `ON DELETE CASCADE` FOREIGN KEY'i olduğu için
   * PRATİKTE İMKANSIZDIR — satıcı silinirse ilanı da CASCADE ile silinir,
   * `run-practice-race.use-case.ts`'teki "horse.ownerId her zaman var olan
   * bir oyuncuya işaret eder" varsayımıyla AYNI kategori) düz bir `Error`
   * fırlatılır — bu dala normal koşullarda ULAŞILMAZ.
   *
   * BİLİNÇLİ SINIRLAMA (bu dilim): bu metod yalnızca İKİ `players` satırını
   * kilitler — `market_listings`/`horses` satırları AYRI, bu transaction'ın
   * DIŞINDA güncellenir (bkz. `BuyMarketListingUseCase` doc yorumu). Bu,
   * `run-practice-race.use-case.ts`'in wallet güncellemesini yarış
   * kaydından AYRI bir transaction'da yapmasıyla AYNI, önceden kabul
   * edilmiş mimari risktir (bkz. o use-case'in doc yorumu) — burada da
   * AYNI gerekçeyle kabul edilmiştir, ayrı bir sertleştirme dilimini hak
   * eder.
   */
  updateTwoWithLock<T>(
    buyerId: string,
    sellerId: string,
    mutate: (buyer: Player, seller: Player) => { buyer: Player; seller: Player; result: T },
  ): Promise<T | null>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const PLAYER_REPOSITORY = Symbol('PLAYER_REPOSITORY');
