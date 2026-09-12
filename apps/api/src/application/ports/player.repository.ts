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
  /** Yeni bir oyuncu kaydı ekler. Var olan bir `id`'yi GÜNCELLEMEZ (bu port'ta ayrı bir `update` metodu yoktur — ilerideki fazlarda eklenecektir). */
  save(player: Player): Promise<void>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const PLAYER_REPOSITORY = Symbol('PLAYER_REPOSITORY');
