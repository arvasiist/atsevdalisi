import type { CareConfig } from '@at-sevdalisi/game-config';
import type { HorseNeedsView } from '@at-sevdalisi/shared-types';

/**
 * YEM VE SU İHTİYACI (17.10.2026, brief §14 "Beslenme ve su ihtiyacı") — saf.
 *
 * İhtiyaç SAYAÇ değildir: son beslenme (yalnızca `needs.feedCategories`
 * kategorisindeki yemler — takviye/ilaç karın doyurmaz) ve son su bakımı
 * anından TÜRETİLİR. Hiç beslenmemiş at çıpadan (`horses.needs_anchor_at`,
 * migration 0102) ölçülür; böylece yürürlük anında hiçbir at habersiz "aç"
 * başlamaz.
 *
 * Düzey: aralık içinde `ok`, aralığın iki katına kadar `due` ("zamanı
 * geldi"), ötesi `urgent` ("acil"). Oyun etkisi YALNIZCA antrenmanda: kazanç en
 * kötü ihtiyacın çarpanıyla ölçeklenir (motor DIŞI; `ok` = 1 → eski davranış).
 */
export type NeedLevel = 'ok' | 'due' | 'urgent';

export const NEED_LEVELS: readonly NeedLevel[] = ['ok', 'due', 'urgent'];

export interface NeedState {
  level: NeedLevel;
  /** İhtiyacın en son karşılandığı an (yoksa çıpa). */
  satisfiedAt: Date;
  /** Bir sonraki beslenme/su zamanı (aralık sonu). */
  dueAt: Date;
}

export interface HorseNeeds {
  feed: NeedState;
  water: NeedState;
  /** Antrenman kazancı çarpanı (en kötü ihtiyacın düzeyi). */
  trainingFactor: number;
}

export interface HorseNeedTimestamps {
  lastFedAt: Date | null;
  lastWateredAt: Date | null;
  anchorAt: Date;
}

const HOUR_MS = 3_600_000;

export function computeNeed(lastAt: Date | null, anchorAt: Date, intervalHours: number, now: Date): NeedState {
  const satisfiedAt = lastAt !== null && lastAt.getTime() > anchorAt.getTime() ? lastAt : anchorAt;
  const elapsed = now.getTime() - satisfiedAt.getTime();
  const interval = intervalHours * HOUR_MS;
  const level: NeedLevel = elapsed <= interval ? 'ok' : elapsed <= 2 * interval ? 'due' : 'urgent';
  return { level, satisfiedAt, dueAt: new Date(satisfiedAt.getTime() + interval) };
}

export function computeHorseNeeds(timestamps: HorseNeedTimestamps, now: Date, config: CareConfig['needs']): HorseNeeds {
  const feed = computeNeed(timestamps.lastFedAt, timestamps.anchorAt, config.feedIntervalHours, now);
  const water = computeNeed(timestamps.lastWateredAt, timestamps.anchorAt, config.waterIntervalHours, now);
  const factors = config.trainingFactorByLevel;
  return { feed, water, trainingFactor: Math.min(factors[feed.level], factors[water.level]) };
}

/** Karın doyuran yem türleri (config kategorisinden; takviye/ilaç hariç). */
export function hungerFeedTypes(care: Pick<CareConfig, 'feedTypes' | 'needs'>): string[] {
  return Object.entries(care.feedTypes)
    .filter(([, effect]) => care.needs.feedCategories.includes(effect.category))
    .map(([type]) => type);
}

/** Açılış denetimi: aralıklar pozitif, kategoriler gerçek, çarpanlar (0, 1] ve azalan, `ok` = 1. */
export function validateNeedsConfig(care: Pick<CareConfig, 'feedTypes' | 'needs'>): string[] {
  const problems: string[] = [];
  const needs = care.needs;
  if (!(needs.feedIntervalHours > 0)) problems.push('needs.feedIntervalHours pozitif olmalı.');
  if (!(needs.waterIntervalHours > 0)) problems.push('needs.waterIntervalHours pozitif olmalı.');
  if (needs.feedCategories.length === 0) problems.push('needs.feedCategories boş.');
  else if (hungerFeedTypes(care).length === 0) problems.push('needs.feedCategories hiçbir yem türüne karşılık gelmiyor.');
  const { ok, due, urgent } = needs.trainingFactorByLevel;
  if (ok !== 1) problems.push('needs.trainingFactorByLevel.ok 1 olmalı (karşılanmış ihtiyaç ceza vermez).');
  for (const [name, value] of Object.entries({ due, urgent })) {
    if (!(value > 0 && value <= 1)) problems.push(`needs.trainingFactorByLevel.${name} (0, 1] dışında.`);
  }
  if (!(urgent <= due)) problems.push('needs.trainingFactorByLevel: acil, "zamanı geldi"den hafif olamaz.');
  return problems;
}

export function toHorseNeedsView(needs: HorseNeeds): HorseNeedsView {
  const view = (state: NeedState) => ({
    level: state.level,
    lastAt: state.satisfiedAt.toISOString(),
    dueAt: state.dueAt.toISOString(),
  });
  return { feed: view(needs.feed), water: view(needs.water), trainingFactor: needs.trainingFactor };
}
