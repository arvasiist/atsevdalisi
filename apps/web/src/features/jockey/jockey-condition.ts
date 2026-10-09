/**
 * JOKEY DURUMU — İSTEMCİ (08.10.2026). Sunucu form + yorgunluğu son
 * binişlerden türetir (`JockeyConditionView`); burada yalnızca metne
 * çevrilir. Yüzdeler sunucudan gelir, istemci yeniden HESAPLAMAZ.
 */
import type { JockeyConditionView, JockeyFormLabel } from '@at-sevdalisi/shared-types';

export const JOCKEY_FORM_LABELS: Readonly<Record<JockeyFormLabel, string>> = {
  hot: 'Çok formda',
  good: 'Formda',
  average: 'Ortalama',
  poor: 'Formsuz',
  cold: 'Kötü gidişat',
  unknown: 'Henüz form yok',
};

function signedPercent(value: number): string {
  if (value === 0) return '±0%';
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`;
}

export function describeJockeyForm(condition: JockeyConditionView): string {
  const label = JOCKEY_FORM_LABELS[condition.form];
  if (condition.form === 'unknown') return `${label} (${condition.formRides} biniş)`;
  return `${label} · son ${condition.formRides} biniş · ${signedPercent(condition.formPercent)}`;
}

export function describeJockeyFatigue(condition: JockeyConditionView): string {
  const base = `Son ${condition.fatigueWindowHours} saatte ${condition.ridesInWindow} biniş (${condition.freeRidesInWindow} binişe kadar yorulmaz)`;
  return condition.fatiguePercent > 0 ? `${base} · Yorgun: −${condition.fatiguePercent.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%` : `${base} · Dinç`;
}
