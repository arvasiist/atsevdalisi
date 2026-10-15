/**
 * PRATİK YARIŞ SINIFLARI (14.10.2026) — `docs/OYUN_DONGUSU_DENETIMI.md` B1/S2.
 *
 * Ölçülen sorun: bütün pratik kademelerin botları 45–75 aralığındaydı; ücretsiz
 * başlangıç atı (güç ≈ 50) en ucuz kademede 40 yarışta hiç ilk üçe giremedi ve
 * yarış başına girişin ~%97'sini kaybetti. Profesyonel oyunların kalıbı
 * (sınıf/handikap): her yarışın rakipleri kendi sınıfının gücündedir ve güçlü
 * at zayıf sınıfı sömüremez — "üst sınıfta koşabilirsin, alt sınıfta asla".
 *
 * Kural: kademe = sınıf. Botlar kademenin `botStatRange`ından üretilir; atın
 * GÜCÜ (hız + ivme + dayanıklılık ortalaması, ırk gücüyle aynı tanım) kademenin
 * `maxHorsePower`ına ULAŞMIŞSA at o kademeye giremez. Değerler ölçülerek
 * seçildi (`race-balance-harness.ts` → `measurePracticeEv`). Motor DEĞİŞMEDİ.
 */

import type { EconomyConfig, PracticeRaceClassConfig } from '@at-sevdalisi/game-config';
import type { HorseStats } from '@at-sevdalisi/shared-types';

/** Güçlü at alt sınıfa giremez (409 `HORSE_TOO_STRONG_FOR_TIER`, para hareketinden ÖNCE). */
export class HorseTooStrongForTierError extends Error {
  constructor(
    public readonly tierId: string,
    public readonly maxHorsePower: number,
  ) {
    super(`Atın bu kademe için fazla güçlü (güç tavanı ${maxHorsePower}) — daha üst bir kademede koş.`);
    this.name = 'HorseTooStrongForTierError';
  }
}

/** Sınıf gücü — `breedRacingPower` ile AYNI üç stat. */
export function horseRacingPower(stats: Pick<HorseStats, 'speed' | 'acceleration' | 'stamina'>): number {
  return (stats.speed + stats.acceleration + stats.stamina) / 3;
}

export function findPracticeRaceClass(economy: EconomyConfig, tierId: string): PracticeRaceClassConfig | null {
  return economy.practiceRaceClasses.find((entry) => entry.tierId === tierId) ?? null;
}

/** Tavanı olmayan sınıfa herkes girer; tavanlı sınıfa güç < tavan olan. */
export function isHorseAllowedInPracticeClass(power: number, raceClass: PracticeRaceClassConfig): boolean {
  return raceClass.maxHorsePower === null || power < raceClass.maxHorsePower;
}

/**
 * API açılışında koşar. Her kademenin TAM bir sınıfı vardır; sınıflar kademe
 * sırasıyla güçlenir (bot aralığı ve tavan artar) ve en az bir sınıf tavansızdır
 * — yoksa yeterince güçlü bir atın koşabileceği pratik yarış kalmazdı.
 */
export function validatePracticeRaceClasses(economy: EconomyConfig): string[] {
  const problems: string[] = [];
  const classes = economy.raceTiers.map((tier) => ({ tierId: tier.id, raceClass: findPracticeRaceClass(economy, tier.id) }));
  for (const { tierId, raceClass } of classes) {
    if (raceClass === null) problems.push(`${tierId}: pratik sınıfı tanımlı değil.`);
  }
  for (const entry of economy.practiceRaceClasses) {
    if (!economy.raceTiers.some((tier) => tier.id === entry.tierId)) {
      problems.push(`${entry.tierId}: böyle bir kademe yok.`);
    }
    const [low, high] = entry.botStatRange;
    if (!(low >= 0 && high <= 100 && low < high)) problems.push(`${entry.tierId}: botStatRange 0 ≤ alt < üst ≤ 100 olmalı.`);
    if (entry.maxHorsePower !== null && !(entry.maxHorsePower > low && entry.maxHorsePower <= 100)) {
      problems.push(`${entry.tierId}: maxHorsePower bot aralığının tabanından büyük ve ≤ 100 olmalı.`);
    }
  }
  const ordered = classes.flatMap(({ raceClass }) => (raceClass === null ? [] : [raceClass]));
  ordered.forEach((raceClass, index) => {
    const previous = ordered[index - 1];
    if (!previous) return;
    if (!(raceClass.botStatRange[0] >= previous.botStatRange[0] && raceClass.botStatRange[1] >= previous.botStatRange[1])) {
      problems.push(`${raceClass.tierId}: bot aralığı bir önceki kademeden zayıf olamaz.`);
    }
    if (previous.maxHorsePower === null && raceClass.maxHorsePower !== null) {
      problems.push(`${raceClass.tierId}: tavansız kademeden sonra tavanlı kademe gelemez.`);
    } else if (previous.maxHorsePower !== null && raceClass.maxHorsePower !== null && raceClass.maxHorsePower <= previous.maxHorsePower) {
      problems.push(`${raceClass.tierId}: güç tavanı bir önceki kademeden yüksek olmalı.`);
    }
  });
  if (!ordered.some((raceClass) => raceClass.maxHorsePower === null)) {
    problems.push('En az bir kademe tavansız olmalı (güçlü atın koşacak yeri kalmazdı).');
  }
  return problems;
}
