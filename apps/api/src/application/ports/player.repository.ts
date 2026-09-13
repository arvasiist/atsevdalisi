import type { Player } from '@at-sevdalisi/shared-types';

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
   */
  updateWithLock<T>(id: string, mutate: (player: Player) => { player: Player; result: T }): Promise<T | null>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const PLAYER_REPOSITORY = Symbol('PLAYER_REPOSITORY');
