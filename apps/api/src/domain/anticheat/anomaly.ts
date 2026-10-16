import type { AnticheatConfig } from '@at-sevdalisi/game-config';

/**
 * ŞÜPHELİ DESEN KURALLARI (02.10.2026, Faz 7) — saf yardımcılar. Desenlerin
 * kendisi veritabanında sayılır (`postgres-anomaly.repository.ts`); burada
 * yalnızca config bütünlüğü ve hesap yaşı vardır. Bulgu bir CEZA değildir.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function accountAgeDays(createdAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / MS_PER_DAY));
}

/** Eşikler pozitif tam sayı olmalı; "yeni hesap" penceresi gözlem penceresinden uzun olamaz. */
export function validateAnticheatConfig(config: AnticheatConfig): string[] {
  const problems: string[] = [];
  const positive: Array<[string, number]> = [
    ['windowDays', config.windowDays],
    ['newAccountDays', config.newAccountDays],
    ['giftFunnel.minDistinctNewSenders', config.giftFunnel.minDistinctNewSenders],
    ['repeatTradePair.minTrades', config.repeatTradePair.minTrades],
    ['newAccountOutflow.minMoney', config.newAccountOutflow.minMoney],
    ['maxFindingsPerRule', config.maxFindingsPerRule],
  ];
  for (const [name, value] of positive) {
    if (!Number.isInteger(value) || value < 1) problems.push(`${name} pozitif tam sayı olmalı`);
  }
  // Tek gönderen/tek satış "desen" değildir — eşik 2'nin altında her hesabı işaretlerdi.
  if (config.giftFunnel.minDistinctNewSenders < 2) problems.push('giftFunnel en az 2 gönderen ister');
  if (config.repeatTradePair.minTrades < 2) problems.push('repeatTradePair en az 2 satış ister');
  return problems;
}
