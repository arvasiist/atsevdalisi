/**
 * MASA KURALLARI (09.10.2026, sahibinin kararı) — "gerçek oyunda giriş
 * bedelinin ne zaman kesildiği, ödülün nasıl hesaplandığı ve kaybedenlerden
 * hangi tutarların alındığı seçilen masanın kurallarına bağlıdır."
 *
 * Masa = yarış kademesi (`economy.raceTiers`: Mahalli/Bölgesel/Ulusal/Elit/
 * Şampiyona). Her masa kendi kuralını config'te taşır:
 *   - `feeTiming`: `on_join` (katılırken) | `on_start` (start anında; o an
 *     parası yetmeyen düşer, borç yazılmaz),
 *   - ödül: `distributionId`in payları; komisyon = 1 − Σpay (ayrı bir sayı
 *     DEĞİL — ikinci doğruluk kaynağı olmasın),
 *   - kaybedene kısmi iade: `loserRefund` (ödül alamayan, `maxPosition`a
 *     kadar bitiren oyuncuya ÖDEDİĞİ bedelin yüzdesi).
 *
 * PARA BASMAMA: iade havuzdan ÖNCE ayrılır, ödül payları kalan üzerinden
 * hesaplanır: Σödül + Σiade = Σpay·(H − İ) + İ ≤ H (Σpay < 1). Saf; DB yok.
 */

import type { EconomyConfig, RaceTableFeeTiming, RaceTierConfig } from '@at-sevdalisi/game-config';
import { computePrizePayouts, resolvePrizeDistribution } from './prize-distribution';

export const RACE_TABLE_FEE_TIMINGS: readonly RaceTableFeeTiming[] = ['on_join', 'on_start'];

const PERCENT = 100;

export function findRaceTable(config: EconomyConfig, tableId: string | null | undefined): RaceTierConfig | null {
  if (typeof tableId !== 'string') return null;
  return config.raceTiers.find((tier) => tier.id === tableId) ?? null;
}

/** Ödül alan sıra sayısı (dağıtımın uzunluğu). */
export function paidPlacesOf(config: EconomyConfig, table: RaceTierConfig): number {
  return resolvePrizeDistribution(config, table.distributionId)?.shares.length ?? 0;
}

/** Ödül alamayan ama iade bandındaki sıra mı? `percent = 0` → hiç kimse. */
export function isLoserRefundEligible(
  finishPosition: number,
  paidPlaces: number,
  rule: RaceTierConfig['loserRefund'],
): boolean {
  return rule.percent > 0 && finishPosition > paidPlaces && finishPosition <= rule.maxPosition;
}

/** İade tutarı: ÖDENEN bedelin yüzdesi, aşağı yuvarlanır (yarım çip basılmaz). */
export function loserRefundAmount(paidFee: number, rule: RaceTierConfig['loserRefund']): number {
  if (!(paidFee > 0) || !(rule.percent > 0)) return 0;
  return Math.floor((paidFee * rule.percent) / PERCENT);
}

export interface TableSettlementEntry {
  entryId: string;
  finishPosition: number;
  /** Defterden okunan, gerçekten ödenmiş bedel. */
  paidFee: number;
}

export interface TableSettlement {
  /** Sıraya göre ödüller (`payouts[i]` = (i+1). sıra), kalan havuz üzerinden. */
  payouts: number[];
  /** Kaybeden iadesi alan katılımlar → tutar (0 olanlar yer almaz). */
  loserRefunds: Map<string, number>;
  refundTotal: number;
}

/**
 * Kesinleşme hesabı. `pool` gerçek ücretlerin toplamıdır (lobide botlar
 * ödemez). İade toplamı havuzu aşarsa bu bir muhasebe bozukluğudur —
 * sessizce kırpılmaz, fırlatılır.
 */
export function computeTableSettlement(
  pool: number,
  shares: readonly number[],
  entries: readonly TableSettlementEntry[],
  rule: RaceTierConfig['loserRefund'],
): TableSettlement {
  const loserRefunds = new Map<string, number>();
  for (const entry of entries) {
    if (!isLoserRefundEligible(entry.finishPosition, shares.length, rule)) continue;
    const amount = loserRefundAmount(entry.paidFee, rule);
    if (amount > 0) loserRefunds.set(entry.entryId, amount);
  }
  const refundTotal = [...loserRefunds.values()].reduce((sum, amount) => sum + amount, 0);
  if (refundTotal > pool) {
    throw new Error(`Kaybeden iadesi (${refundTotal}) havuzu (${pool}) aşıyor — masa kuralı ya da havuz bozuk.`);
  }
  return { payouts: computePrizePayouts(pool - refundTotal, shares), loserRefunds, refundTotal };
}

/** Bir masanın kendi kuralları (`validateRaceTiers` her masa için çağırır). */
export function validateRaceTableRules(table: RaceTierConfig, paidPlaces: number): string[] {
  const where = `raceTiers[${table.id}]`;
  const problems: string[] = [];
  if (!RACE_TABLE_FEE_TIMINGS.includes(table.feeTiming)) {
    problems.push(`${where}: feeTiming ${RACE_TABLE_FEE_TIMINGS.join('/')} olmalı (verilen: ${String(table.feeTiming)}).`);
  }
  const rule = table.loserRefund;
  if (rule === undefined || rule === null) {
    problems.push(`${where}: loserRefund tanımlı olmalı (iade yoksa { "percent": 0, "maxPosition": 0 }).`);
    return problems;
  }
  if (!Number.isInteger(rule.percent) || rule.percent < 0 || rule.percent > PERCENT) {
    problems.push(`${where}: loserRefund.percent 0-100 arası tam sayı olmalı (verilen: ${rule.percent}).`);
  }
  if (rule.percent > 0) {
    if (!Number.isInteger(rule.maxPosition) || rule.maxPosition <= paidPlaces || rule.maxPosition > table.fieldSize) {
      problems.push(
        `${where}: loserRefund.maxPosition ödül alan sıradan (${paidPlaces}) büyük ve fieldSize'dan (${table.fieldSize}) büyük olmayan bir tam sayı olmalı (verilen: ${rule.maxPosition}).`,
      );
    }
  }
  return problems;
}

/** Komisyon yüzdesi — dağıtımın paylarından TÜRETİLİR. */
export function tableRakePercent(shares: readonly number[]): number {
  const total = shares.reduce((sum, share) => sum + share, 0);
  return Math.round((1 - total) * PERCENT);
}
