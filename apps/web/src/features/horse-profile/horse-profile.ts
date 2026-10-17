import {
  HORSE_VISIBLE_STAT_KEYS,
  type HorseCareerRaceView,
  type HorseRecordSummary,
  type HorseUpbringingView,
  type HorseVisibleStatKey,
  type HorseVisibleStats,
} from '@at-sevdalisi/shared-types';
import { formatCurrency } from '../../lib/currency';

/**
 * 16.10.2026 — at profili (brief §3): görünür statlar + kariyer. Saf
 * biçimlendirme; sayıların kaynağı sunucudur (`stats`, `GET /horses/:id/career`).
 */
export const HORSE_STAT_LABELS: Record<HorseVisibleStatKey, string> = {
  speed: 'Hız',
  acceleration: 'İvme',
  stamina: 'Dayanıklılık',
  sprint: 'Sprint',
  endurance: 'Uzun soluk',
  startSpeed: 'Çıkış',
  finishSpeed: 'Bitiriş',
  cornering: 'Viraj',
};

export interface StatRow {
  key: HorseVisibleStatKey;
  label: string;
  value: number;
}

/** Sabit sırada stat satırları (sunucunun anahtar listesiyle aynı). */
export function statRows(stats: HorseVisibleStats): StatRow[] {
  return HORSE_VISIBLE_STAT_KEYS.map((key) => ({
    key,
    label: HORSE_STAT_LABELS[key],
    value: Math.round(stats[key] * 10) / 10,
  }));
}

/** "12 koşu · 3 birincilik · 5 ilk üç · 1.240 çip · 2 tay" — sıfır kalemler yazılmaz. */
export function describeRecord(record: HorseRecordSummary): string {
  if (record.starts === 0 && record.foals === 0) {
    return 'Kayıtlı koşu yok';
  }
  const parts: string[] = [`${record.starts} koşu`];
  if (record.wins > 0) parts.push(`${record.wins} birincilik`);
  if (record.places > 0) parts.push(`${record.places} ilk üç`);
  if (record.earnings > 0) parts.push(formatCurrency('money', record.earnings));
  if (record.foals > 0) parts.push(`${record.foals} tay`);
  return parts.join(' · ');
}

/** "3/8" — derece / bitiren at sayısı. */
export function formatPlacing(race: Pick<HorseCareerRaceView, 'finishPosition' | 'fieldSize'>): string {
  return `${race.finishPosition}/${race.fieldSize}`;
}

/** Kazanma oranı (yüzde, tam sayı); koşusu yoksa `null`. */
export function winRatePercent(record: Pick<HorseRecordSummary, 'starts' | 'wins'>): number | null {
  return record.starts > 0 ? Math.round((record.wins / record.starts) * 100) : null;
}

/** 16.10.2026 — tay büyütme ilerlemesi (brief §7); sayılar sunucudan. */
export function describeUpbringing(view: HorseUpbringingView): string {
  const remaining = Math.max(0, view.feedsMax - view.feedsUsed);
  if (remaining === 0) {
    return `Tay yetiştirmesi tamamlandı (${view.feedsMax}/${view.feedsMax}).`;
  }
  return `Tay yemi ${view.feedsUsed}/${view.feedsMax} · her beslemede +${view.gainPerFeed} stat · kalan ${remaining} beslemenin maliyeti ${formatCurrency(
    'money',
    view.remainingCost,
  )}`;
}
