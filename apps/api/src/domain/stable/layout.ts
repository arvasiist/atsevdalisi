/**
 * AHIR BÖLMELERİ (16.10.2026) — saf kurallar. Her atın sahibinin ahırında bir
 * bölmesi vardır (1..kapasite). Veritabanında numarası olmayan at (yeni doğan,
 * yeni alınan, 0097 öncesi) kayıt sırasıyla EN DÜŞÜK boş bölmeye yerleşir;
 * ekran, liste ve taşıma ucu aynı fonksiyonu kullanır (ikinci yerleşim kuralı
 * yok). Kapasite düşmez; eski bir oyuncunun kapasitesinden fazla atı varsa
 * fazla atlar kapasitenin ötesindeki numaralara yerleşir (görünür, silinmez).
 */
import { HorseNotInStableError, InvalidStallNumberError, StallLockedError } from './errors';

export interface StallHorse {
  id: string;
  stallNumber: number | null;
  createdAt: string;
}

export interface StallAssignment {
  horseId: string;
  stallNumber: number;
}

function byCreation(a: StallHorse, b: StallHorse): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Bütün atların bölmesi (bölme numarasına göre sıralı). */
export function resolveStableLayout(horses: readonly StallHorse[], capacity: number): StallAssignment[] {
  const ordered = [...horses].sort(byCreation);
  const upper = Math.max(capacity, ordered.length);
  const taken = new Set<number>();
  const placed = new Map<string, number>();
  for (const horse of ordered) {
    const n = horse.stallNumber;
    if (n !== null && Number.isInteger(n) && n >= 1 && n <= upper && !taken.has(n)) {
      taken.add(n);
      placed.set(horse.id, n);
    }
  }
  let next = 1;
  for (const horse of ordered) {
    if (placed.has(horse.id)) continue;
    while (taken.has(next)) next += 1;
    taken.add(next);
    placed.set(horse.id, next);
  }
  return ordered
    .map((horse) => ({ horseId: horse.id, stallNumber: placed.get(horse.id)! }))
    .sort((a, b) => a.stallNumber - b.stallNumber);
}

/**
 * Atı hedef bölmeye taşır; bölme doluysa iki at YER DEĞİŞTİRİR. Hedef açık
 * kapasitenin içinde olmalı (kilitli bölmeye taşınamaz → 409).
 */
export function moveHorseInLayout(
  layout: readonly StallAssignment[],
  horseId: string,
  target: unknown,
  capacity: number,
): StallAssignment[] {
  if (typeof target !== 'number' || !Number.isInteger(target) || target < 1) {
    throw new InvalidStallNumberError();
  }
  if (target > capacity) {
    throw new StallLockedError(target, capacity);
  }
  const moving = layout.find((entry) => entry.horseId === horseId);
  if (!moving) {
    throw new HorseNotInStableError(horseId);
  }
  const occupant = layout.find((entry) => entry.stallNumber === target);
  return layout
    .map((entry) => {
      if (entry.horseId === horseId) return { horseId, stallNumber: target };
      if (occupant && entry.horseId === occupant.horseId) return { horseId: entry.horseId, stallNumber: moving.stallNumber };
      return entry;
    })
    .sort((a, b) => a.stallNumber - b.stallNumber);
}
