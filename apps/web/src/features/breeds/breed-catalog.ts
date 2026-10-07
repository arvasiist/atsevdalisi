/**
 * AT IRKLARI — İSTEMCİ (07.10.2026). Katalog `config/breeds.config.json`dan
 * (sunucu ile AYNI dosya). Fiyat, seviye şartı ve statlar burada YALNIZCA
 * gösterilir; alımda sunucu hepsini kendi config'inden yeniden okur ve
 * istemci fiyat göndermez.
 */
import { loadBreedsConfig, type BreedDefinitionConfig, type BreedStatKey } from '@at-sevdalisi/game-config';

export const BREEDS_CONFIG = loadBreedsConfig();

/** Mağazada fiyata göre sıralı ırklar (en ucuzdan pahalıya). */
export const SHOP_BREEDS: readonly BreedDefinitionConfig[] = [...BREEDS_CONFIG.breeds].sort(
  (a, b) => a.priceMoney - b.priceMoney,
);

/** `horses.breed` anahtarının Türkçe adı; katalogda yoksa (eski veri) anahtarın kendisi. */
export function breedLabel(key: string): string {
  return BREEDS_CONFIG.breeds.find((breed) => breed.key === key)?.name ?? key;
}

export function isStarterBreed(key: string): boolean {
  return BREEDS_CONFIG.starterBreed === key;
}

/** Kartta gösterilen stat çubukları (görünen statlar; gizli statlar ırkta YOK). */
export const SHOP_STAT_LABELS: ReadonlyArray<{ key: BreedStatKey; label: string }> = [
  { key: 'speed', label: 'Hız' },
  { key: 'acceleration', label: 'İvme' },
  { key: 'stamina', label: 'Dayanıklılık' },
  { key: 'strength', label: 'Güç' },
  { key: 'agility', label: 'Çeviklik' },
];

export const DISTANCE_LABELS = { short: 'Kısa', middle: 'Orta', long: 'Uzun' } as const;

/** Irkın en iyi olduğu mesafe (eşitlikte ilk sıradaki). */
export function bestDistance(breed: BreedDefinitionConfig): keyof typeof DISTANCE_LABELS {
  const order: Array<keyof typeof DISTANCE_LABELS> = ['short', 'middle', 'long'];
  return order.reduce((best, key) => ((breed.distance[key] ?? 50) > (breed.distance[best] ?? 50) ? key : best), order[0]!);
}

export type BreedAvailability = 'ok' | 'level' | 'money';

/** Düğme durumu — yalnızca kullanıcıya ipucu; kararı sunucu verir. */
export function breedAvailability(breed: BreedDefinitionConfig, level: number, money: number): BreedAvailability {
  if (level < breed.minPlayerLevel) return 'level';
  if (money < breed.priceMoney) return 'money';
  return 'ok';
}
