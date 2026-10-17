import type { StableConfig } from '@at-sevdalisi/game-config';
import type { StallView } from '@at-sevdalisi/shared-types';

/**
 * AHIR BÖLMELERİ (16.10.2026, migration 0097). Okuma kilitsizdir; taşıma
 * oyuncu satırı `FOR UPDATE` altında yerleşimi yeniden türetir ve TAMAMINI
 * kalıcılaştırır (ilk taşımada türetilmiş yerleşim kalıcı olur).
 */
export interface StableLayoutRepository {
  findStalls(ownerId: string, stable: StableConfig): Promise<{ capacity: number; stalls: StallView[] }>;
  moveHorse(
    ownerId: string,
    horseId: string,
    stallNumber: unknown,
    stable: StableConfig,
  ): Promise<{ capacity: number; stalls: StallView[] }>;
}

export const STABLE_LAYOUT_REPOSITORY = Symbol('STABLE_LAYOUT_REPOSITORY');
