/**
 * EKİPMAN KATALOĞU — saf ekran mantığı (08.10.2026). Kalite, fiyat ve seviye
 * şartı `config/equipment.config.json`ten okunur; sunucu aynı kataloğu
 * kullanır ve kuralı KENDİSİ uygular. Buradaki kontrol yalnızca düğmeyi
 * dürüstçe kapatmak içindir.
 */
import type { EquipmentType, HorseEquipment, PurchaseHorseEquipmentResult } from '@at-sevdalisi/shared-types';
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

/**
 * 16.10.2026 (brief §8) — tip grupları. `apps/api/src/domain/equipment/
 * validation.ts` ile BİREBİR aynı tutulmalıdır (web, api'nin domain kodunu
 * import edemez). Kategori tipten türetilir: kozmetik yarışı ETKİLEMEZ.
 */
export const PERFORMANCE_EQUIPMENT_TYPES: readonly EquipmentType[] = ['saddle', 'bridle', 'horseshoe', 'blinkers', 'leg_wraps'];
export const COSMETIC_EQUIPMENT_TYPES: readonly EquipmentType[] = ['halter', 'blanket', 'nameplate', 'collectible'];

export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  saddle: 'Eyer',
  bridle: 'Dizgin',
  horseshoe: 'Nal',
  blinkers: 'Göz Siperi',
  leg_wraps: 'Bacak Bandajı',
  halter: 'Yular',
  blanket: 'Örtü / Battaniye',
  nameplate: 'İsimlik',
  collectible: 'Koleksiyon',
};

export const EQUIPMENT_RARITY_LABELS: Record<EquipmentCatalogItemConfig['rarity'], string> = {
  common: 'Sıradan',
  rare: 'Nadir',
  epic: 'Destansı',
  legendary: 'Efsanevi',
};

const SURFACE_LABELS: Record<NonNullable<EquipmentCatalogItemConfig['surface']>, string> = {
  grass: 'Çim',
  dirt: 'Toprak',
  synthetic: 'Sentetik',
};

export function isCosmeticEquipment(type: EquipmentType): boolean {
  return COSMETIC_EQUIPMENT_TYPES.includes(type);
}

/** Katalog satırının özeti — sayılar config'ten (sunucu aynı kataloğu uygular). */
export function describeCatalogItem(item: EquipmentCatalogItemConfig): string {
  const rarity = EQUIPMENT_RARITY_LABELS[item.rarity];
  if (isCosmeticEquipment(item.equipmentType as EquipmentType)) {
    return `Kozmetik — yarışa etkisi yok · ${rarity}`;
  }
  const parts = [`Kalite ${item.quality}`, `${item.durabilityRaces} yarış dayanır`, rarity];
  if (item.surface !== null) parts.push(`yalnızca ${SURFACE_LABELS[item.surface]} zeminde etkili`);
  return parts.join(' · ');
}

/** Envanterdeki parçanın ömrü — sunucunun yazdığı sayılardan. */
export function describeDurability(item: Pick<HorseEquipment, 'maxRaces' | 'racesRemaining' | 'surface'>): string {
  const surface = item.surface ? ` · yalnızca ${SURFACE_LABELS[item.surface]} zeminde` : '';
  if (item.maxRaces === null || item.racesRemaining === null) return `Aşınmaz${surface}`;
  if (item.racesRemaining === 0) return 'Aşındı — yenisini al';
  return `${item.racesRemaining}/${item.maxRaces} yarış kaldı${surface}`;
}

export function isWornOut(item: Pick<HorseEquipment, 'racesRemaining'>): boolean {
  return item.racesRemaining === 0;
}
