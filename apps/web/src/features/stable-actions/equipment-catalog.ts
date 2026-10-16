/**
 * EKİPMAN KATALOĞU — saf ekran mantığı (08.10.2026). Kalite, fiyat ve seviye
 * şartı `config/equipment.config.json`ten okunur; sunucu aynı kataloğu
 * kullanır ve kuralı KENDİSİ uygular. Buradaki kontrol yalnızca düğmeyi
 * dürüstçe kapatmak içindir.
 */
import type { EquipmentType, PurchaseHorseEquipmentResult } from '@at-sevdalisi/shared-types';
import { loadEquipmentConfig, type EquipmentCatalogItemConfig } from '@at-sevdalisi/game-config';

export const EQUIPMENT_CATALOG: readonly EquipmentCatalogItemConfig[] = loadEquipmentConfig().catalog;

export function catalogItemsOfType(type: EquipmentType): EquipmentCatalogItemConfig[] {
  return EQUIPMENT_CATALOG.filter((item) => item.equipmentType === type).sort((a, b) => a.priceMoney - b.priceMoney);
}

export type EquipmentPurchaseBlock = 'level' | 'money' | null;

export function equipmentPurchaseBlock(
  item: EquipmentCatalogItemConfig,
  player: { level: number; money: number } | null,
): EquipmentPurchaseBlock {
  if (!player) return 'money';
  if (player.level < item.requiredLevel) return 'level';
  if (player.money < item.priceMoney) return 'money';
  return null;
}

export function describeEquipmentPurchase(result: PurchaseHorseEquipmentResult): string {
  return `${result.item.name} alındı (${result.price} çip). Kuşandırmak için envanterden seç.`;
}
