/**
 * AHIR BÖLMELERİ — saf ekran mantığı (16.10.2026). Bölme numarası sunucudan
 * gelir (`PublicHorse.stallNumber`, `resolveStableLayout`); kapasite ve
 * seviyelerin kapasitesi `stable-summary`den. Bu dosya three.js İÇE AKTARMAZ.
 *
 * 3D sahne ahırı TEK UZUN koridor gibi gösterir: seçili at ortadaki bölmede,
 * arka sıradaki komşu bölmeler onun bir/iki önceki ve sonraki bölmeleridir —
 * başka ata geçmek koridorda yürümek gibidir.
 */
import type { StableLevelView } from '@at-sevdalisi/shared-types';
import { STABLE_LAYOUT } from './stable-layout';

export type StallState =
  | { kind: 'occupied'; horseId: string }
  | { kind: 'empty' }
  | { kind: 'locked'; unlockLevel: number | null };

export interface StallContext {
  capacity: number;
  maxStalls: number;
  /** bölme numarası → at kimliği */
  occupants: ReadonlyMap<number, string>;
  levels: ReadonlyArray<Pick<StableLevelView, 'level' | 'capacity'>>;
}

/** Bölmenin hangi ahır seviyesinde açıldığı (`null`: hiçbir seviyede açılmaz). */
export function unlockLevelForStall(
  stallNumber: number,
  levels: ReadonlyArray<Pick<StableLevelView, 'level' | 'capacity'>>,
): number | null {
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  return sorted.find((row) => row.capacity >= stallNumber)?.level ?? null;
}

export function stallState(stallNumber: number, context: StallContext): StallState {
  const horseId = context.occupants.get(stallNumber);
  if (horseId) return { kind: 'occupied', horseId };
  if (stallNumber <= context.capacity) return { kind: 'empty' };
  return { kind: 'locked', unlockLevel: unlockLevelForStall(stallNumber, context.levels) };
}

/** Ahırdaki bütün bölmeler (1..max(toplam, dolu en yüksek numara)). */
export function allStalls(context: StallContext): Array<{ stallNumber: number; state: StallState }> {
  const highestOccupied = Math.max(0, ...context.occupants.keys());
  const total = Math.max(context.maxStalls, highestOccupied);
  return Array.from({ length: total }, (_, index) => ({
    stallNumber: index + 1,
    state: stallState(index + 1, context),
  }));
}

/**
 * Panelde gösterilecek bölme sayısı: açık bölmeler + BİR SONRAKİ ahır
 * seviyesinin açacağı bölmeler (dolu en yüksek numaradan az değil). Daha
 * ilerideki kilitli bölmeler tek satırda özetlenir — 40 bölmelik liste
 * telefonda kayboluyordu.
 */
export function visibleStallCount(context: StallContext): number {
  const nextCapacity = [...context.levels]
    .sort((a, b) => a.level - b.level)
    .find((row) => row.capacity > context.capacity)?.capacity;
  const highestOccupied = Math.max(0, ...context.occupants.keys());
  return Math.max(nextCapacity ?? context.capacity, highestOccupied, context.capacity);
}

export interface SceneNeighbor {
  /** Ortadaki bölmeye göre bölme farkı (−2, −1, +1, +2). */
  offset: number;
  /** Bölmenin sahnedeki X merkezi (metre). */
  x: number;
  stallNumber: number;
  state: StallState;
}

/**
 * Arka sıradaki komşu bölmeler. Numarası 1'in altında ya da toplam bölmenin
 * üstünde olan bölme sahnede boş depo olarak kalır (listeye girmez).
 */
export function sceneNeighbors(stageStall: number, context: StallContext): SceneNeighbor[] {
  const half = Math.floor(STABLE_LAYOUT.baysPerRow / 2);
  const total = Math.max(context.maxStalls, ...context.occupants.keys());
  const neighbors: SceneNeighbor[] = [];
  for (let offset = -half; offset <= half; offset += 1) {
    const stallNumber = stageStall + offset;
    if (offset === 0 || stallNumber < 1 || stallNumber > total) continue;
    neighbors.push({ offset, x: offset * STABLE_LAYOUT.bayLength, stallNumber, state: stallState(stallNumber, context) });
  }
  return neighbors;
}

/** Bölme etiketinin kısa metni. */
export function describeStall(state: StallState, horseName?: string): string {
  if (state.kind === 'occupied') return horseName ?? 'At';
  if (state.kind === 'empty') return '+ At al';
  return state.unlockLevel === null ? 'Kilitli' : `🔒 Ahır Sv. ${state.unlockLevel}`;
}
