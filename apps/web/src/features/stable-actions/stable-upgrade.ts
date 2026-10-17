/**
 * AHIR GELİŞTİRME — saf ekran mantığı (16.10.2026). Seviye, kapasite, konfor
 * bonusu, oyuncu seviyesi şartı ve bedel sunucunun `stable-summary`
 * yanıtından gelir; sunucu aynı kuralları yükseltme anında KENDİSİ uygular.
 * Buradaki kontrol yalnızca düğmeyi dürüstçe kapatmak içindir.
 */
import type { StableLevelView, StableUpgradeOfferView } from '@at-sevdalisi/shared-types';
import { hasEnoughFunds } from '../../lib/currency';

export type StableUpgradeBlock = 'max' | 'level' | 'money' | null;

export function stableUpgradeBlock(
  offer: StableUpgradeOfferView | null,
  player: { level: number; money: number; gems: number } | null,
): StableUpgradeBlock {
  if (offer === null) return 'max';
  if (player === null) return 'money';
  if (player.level < offer.requiredPlayerLevel) return 'level';
  if (!hasEnoughFunds(player, offer.cost)) return 'money';
  return null;
}

export function describeStableUpgradeBlock(block: StableUpgradeBlock, offer: StableUpgradeOfferView | null): string | null {
  switch (block) {
    case 'max':
      return 'Ahırın en yüksek seviyede.';
    case 'level':
      return `Bu seviye için en az ${offer?.requiredPlayerLevel}. oyuncu seviyesi gerekir.`;
    case 'money':
      return 'Yeterli bakiyen yok — yarış kazanarak ya da günlük ödülle çip biriktir.';
    default:
      return null;
  }
}

/** Konfor bonusu metni (yüzde sunucudan). */
export function describeComfort(percent: number): string {
  return percent > 0 ? `Atlar %${percent} daha hızlı dinlenir` : 'Konfor bonusu yok';
}

export type StableLevelState = 'reached' | 'current' | 'next' | 'locked';

/** Yol haritasında satırın durumu. */
export function stableLevelState(row: Pick<StableLevelView, 'level'>, currentLevel: number): StableLevelState {
  if (row.level < currentLevel) return 'reached';
  if (row.level === currentLevel) return 'current';
  if (row.level === currentLevel + 1) return 'next';
  return 'locked';
}
