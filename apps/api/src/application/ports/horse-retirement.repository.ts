import type { Horse } from '@at-sevdalisi/shared-types';

/**
 * 15.10.2026 — S5 emeklilik. Bütün kurallar TEK transaction'da, at satırı
 * kilitliyken koşar (sahiplik, ilan, açık yarış, son at) — kontrol ile yazma
 * arasında atın satılması ya da yarışa yazılması mümkün olmasın.
 */
export interface HorseRetirementRepository {
  retire(input: { playerId: string; horseId: string; now: Date }): Promise<Horse>;
}

export const HORSE_RETIREMENT_REPOSITORY = Symbol('HORSE_RETIREMENT_REPOSITORY');
