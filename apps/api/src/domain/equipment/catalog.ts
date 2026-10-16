import type { EquipmentCatalogConfig, EquipmentCatalogItemConfig } from '@at-sevdalisi/game-config';
import type { EquipmentType } from '@at-sevdalisi/shared-types';
import { InvalidEquipmentInputError } from './errors';
import {
  EQUIPMENT_TYPES,
  MAX_EQUIPMENT_NAME_LENGTH,
  MAX_EQUIPMENT_QUALITY,
  MIN_EQUIPMENT_NAME_LENGTH,
  MIN_EQUIPMENT_QUALITY,
} from './validation';

/**
 * EKİPMAN KATALOĞU (08.10.2026) — saf. Ekipman artık yalnızca katalogdan,
 * oyun parasıyla alınır: oyuncu kalem ANAHTARINI seçer, ad/tip/kalite/fiyat
 * config'ten gelir. Eskiden kalite istemcideydi ve ücret yoktu — her at
 * bedavaya azami yarış bonusu (×1.05) alabiliyordu (CLAUDE.md kural 1:
 * istemci envanteri/statı belirlemez).
 */

/** Seviye şartı tutmayan alım (409, ırk mağazasıyla aynı sınıf). */
export class EquipmentLevelLockedError extends Error {
  constructor(
    public readonly playerLevel: number,
    public readonly requiredLevel: number,
  ) {
    super(`Bu ekipmanı almak için en az ${requiredLevel}. seviye olmalısın (şu an ${playerLevel}).`);
    this.name = 'EquipmentLevelLockedError';
  }
}

/** Gövdeden gelen anahtarı kataloğa çözer; metin değilse ya da bilinmiyorsa 400. */
export function findEquipmentItem(config: EquipmentCatalogConfig, key: unknown): EquipmentCatalogItemConfig {
  if (typeof key !== 'string' || key.length === 0) {
    throw new InvalidEquipmentInputError('Ekipman kalemi (catalogKey) zorunludur.');
  }
  const item = config.catalog.find((candidate) => candidate.key === key);
  if (!item) {
    throw new InvalidEquipmentInputError(`Bilinmeyen ekipman kalemi: "${key}".`);
  }
  return item;
}

export function assertCanBuyEquipment(item: EquipmentCatalogItemConfig, playerLevel: number): void {
  if (playerLevel < item.requiredLevel) {
    throw new EquipmentLevelLockedError(playerLevel, item.requiredLevel);
  }
}

/**
 * Katalog tutarlılığı — API açılışında ve testte koşar; bozuk katalogla API
 * AÇILMAZ. Kurallar: anahtar tekil; tip bilinen beş tipten biri; kalite
 * 0-100; fiyat pozitif tam sayı; seviye 1..maxLevel; her tipin en az bir
 * kalemi var; AYNI tipte daha kaliteli kalem daha ucuz OLAMAZ (ucuz yoldan
 * azami bonus kapısı açılmasın).
 */
export function validateEquipmentConfig(config: EquipmentCatalogConfig, maxPlayerLevel: number): void {
  const fail = (message: string): never => {
    throw new Error(`Ekipman kataloğu geçersiz (config/equipment.config.json): ${message}`);
  };
  if (!Array.isArray(config.catalog) || config.catalog.length === 0) {
    fail('en az bir kalem olmalı.');
  }
  const keys = new Set<string>();
  for (const item of config.catalog) {
    if (!item.key || keys.has(item.key)) fail(`anahtar boş ya da tekrarlı: "${item.key}".`);
    keys.add(item.key);
    if (!(EQUIPMENT_TYPES as readonly string[]).includes(item.equipmentType)) {
      fail(`"${item.key}" bilinmeyen tip: ${item.equipmentType}.`);
    }
    const nameLength = item.name?.trim().length ?? 0;
    if (nameLength < MIN_EQUIPMENT_NAME_LENGTH || nameLength > MAX_EQUIPMENT_NAME_LENGTH) {
      fail(`"${item.key}" adı ${MIN_EQUIPMENT_NAME_LENGTH}-${MAX_EQUIPMENT_NAME_LENGTH} karakter olmalı.`);
    }
    if (
      !Number.isFinite(item.quality) ||
      item.quality < MIN_EQUIPMENT_QUALITY ||
      item.quality > MAX_EQUIPMENT_QUALITY
    ) {
      fail(`"${item.key}" kalitesi ${MIN_EQUIPMENT_QUALITY}-${MAX_EQUIPMENT_QUALITY} dışında.`);
    }
    if (!Number.isInteger(item.priceMoney) || item.priceMoney <= 0) fail(`"${item.key}" fiyatı pozitif tam sayı olmalı.`);
    if (!Number.isInteger(item.requiredLevel) || item.requiredLevel < 1 || item.requiredLevel > maxPlayerLevel) {
      fail(`"${item.key}" seviye şartı 1-${maxPlayerLevel} dışında.`);
    }
  }
  for (const type of EQUIPMENT_TYPES) {
    const ofType = config.catalog.filter((item) => item.equipmentType === type);
    if (ofType.length === 0) fail(`"${type}" tipinde kalem yok.`);
    for (const better of ofType) {
      for (const worse of ofType) {
        if (better.quality > worse.quality && better.priceMoney < worse.priceMoney) {
          fail(`"${better.key}" "${worse.key}"dan kaliteli ama daha ucuz.`);
        }
      }
    }
  }
}

export function equipmentTypeOf(item: EquipmentCatalogItemConfig): EquipmentType {
  return item.equipmentType as EquipmentType;
}
