/**
 * KARİYER EKRANI (16.10.2026, brief §10) — saf yardımcılar. Puan, kademe ve
 * puan tablosu SUNUCUDAN gelir (`GET /career`); burada yalnızca ilerleme
 * yüzdesi ve "sıradaki hedef" cümlesi üretilir.
 */
import type { CareerView } from '@at-sevdalisi/shared-types';

/** Mevcut kademeden sıradakine ilerleme (0–100); son kademede 100. */
export function careerProgressPercent(view: Pick<CareerView, 'points' | 'tier' | 'next' | 'tiers'>): number {
  if (view.next === null) return 100;
  const from = view.tiers[view.tier.index]?.requiredPoints ?? 0;
  const span = view.next.requiredPoints - from;
  if (span <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(((view.points - from) / span) * 100)));
}

/**
 * "Bölgesel kademeye 23 puan: yaklaşık 3 Mahalli Koşu birinciliği." — en
 * yüksek birincilik puanlı AÇIK sınıf örnek alınır (kilitli masa önerilmez).
 */
export function describeNextGoal(view: CareerView): string {
  if (view.next === null) return 'En üst kademedesin — büyük finallerde yarışmaya devam et.';
  const unlocked = new Set(
    view.tiers.filter((tier) => tier.reached).flatMap((tier) => tier.unlocksTables.map((table) => table.id)),
  );
  const open = view.racePoints.filter(
    (row) => unlocked.has(row.classKey) || ['open', 'practice'].includes(row.classKey),
  );
  const best = open.sort((a, b) => b.points[0] - a.points[0])[0];
  const head = `${view.next.name} kademesine ${view.next.pointsToNext} puan`;
  if (!best || best.points[0] <= 0) return `${head}.`;
  const wins = Math.ceil(view.next.pointsToNext / best.points[0]);
  return `${head}: yaklaşık ${wins} ${best.classLabel} birinciliği.`;
}

export function formatPlace(position: number, fieldSize: number): string {
  return `${position}. / ${fieldSize}`;
}
