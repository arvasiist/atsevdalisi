import type { Horse } from '@at-sevdalisi/shared-types';

/**
 * `HorseRepository` — Application katmanının Infrastructure'a bağlandığı
 * PORT (interface). Bkz. `application/ports/player.repository.ts` ile
 * AYNI desen (docs/ARCHITECTURE.md §4).
 */
export interface HorseRepository {
  findById(id: string): Promise<Horse | null>;
  findByOwnerId(ownerId: string): Promise<Horse[]>;
  /** Yeni bir at kaydı ekler. Var olan bir `id`'yi GÜNCELLEMEZ (ilerideki fazlarda ayrı bir `update` metodu eklenecektir). */
  save(horse: Horse): Promise<void>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const HORSE_REPOSITORY = Symbol('HORSE_REPOSITORY');
