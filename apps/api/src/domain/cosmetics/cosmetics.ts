/**
 * KOZMETİK MAĞAZA (09.10.2026, elmas politikası) — saf kurallar, DB yok.
 *
 * Her ürün avatar kataloğundaki BİR seçeneği (`catalog` + `optionId`) açar.
 * Bu seçenek:
 *   - sahibi olmayanın avatar kaydında REDDEDİLİR (409 `COSMETIC_NOT_OWNED`),
 *   - varsayılan (türetilen) avatarda ASLA seçilmez — aksi hâlde kimse
 *     ödemeden "premium" görünürdü; ayrıca seçenek eklemek mevcut oyuncuların
 *     varsayılan görünüşünü değiştirmez (kilitli seçenekler havuzun dışında).
 * Yalnızca GÖRÜNÜŞ: hiçbir ürün yarışı, statları ya da ekonomiyi etkilemez.
 */

import type { AvatarAppearance, AvatarField } from '@at-sevdalisi/shared-types';
import type { AvatarCatalogKey, AvatarConfig, CosmeticItemConfig, CosmeticsConfig } from '@at-sevdalisi/game-config';
import { CosmeticNotOwnedError } from './errors';

const KEY_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;

/** `katalog:seçenek` → ürün. */
export function premiumOptionIndex(cosmetics: CosmeticsConfig): Map<string, CosmeticItemConfig> {
  return new Map(cosmetics.items.map((item) => [optionRef(item.catalog, item.optionId), item]));
}

export function optionRef(catalog: AvatarCatalogKey, optionId: string): string {
  return `${catalog}:${optionId}`;
}

export function findCosmetic(cosmetics: CosmeticsConfig, key: unknown): CosmeticItemConfig | null {
  if (typeof key !== 'string') return null;
  return cosmetics.items.find((item) => item.key === key) ?? null;
}

/** Renk kataloğuysa seçeneğin hex rengi (önizleme), değilse `null`. */
export function cosmeticColor(item: CosmeticItemConfig, avatar: AvatarConfig): string | null {
  const entry = avatar[item.catalog];
  return Array.isArray(entry) ? null : ((entry as Record<string, string>)[item.optionId] ?? null);
}

/**
 * Avatar kaydı: seçilen her kilitli seçeneğin ürününe sahip olunmalı.
 * `catalogOf` alanı kataloğuna çevirir (`AVATAR_CATALOG_KEYS`).
 */
export function assertAvatarCosmeticsOwned(
  appearance: AvatarAppearance,
  catalogOf: Record<AvatarField, AvatarCatalogKey>,
  ownedKeys: ReadonlySet<string>,
  cosmetics: CosmeticsConfig,
): void {
  const index = premiumOptionIndex(cosmetics);
  for (const [field, value] of Object.entries(appearance) as Array<[AvatarField, string]>) {
    const item = index.get(optionRef(catalogOf[field], value));
    if (item !== undefined && !ownedKeys.has(item.key)) {
      throw new CosmeticNotOwnedError(item.key, item.name);
    }
  }
}

/** API açılışında: bozuk mağaza config'i ile API AÇILMAZ. */
export function validateCosmeticsConfig(cosmetics: CosmeticsConfig, avatar: AvatarConfig): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  const refs = new Set<string>();
  for (const item of cosmetics.items) {
    const where = `cosmetics[${item.key}]`;
    if (!KEY_PATTERN.test(item.key)) problems.push(`${where}: anahtar kalıba uymuyor.`);
    if (keys.has(item.key)) problems.push(`${where}: anahtar tekrar ediyor.`);
    keys.add(item.key);
    if (typeof item.name !== 'string' || item.name.trim() === '') problems.push(`${where}: ad boş olamaz.`);
    if (!Number.isInteger(item.priceGems) || item.priceGems <= 0) problems.push(`${where}: priceGems pozitif tam sayı olmalı.`);
    const entry = (avatar as unknown as Record<string, unknown>)[item.catalog];
    const options = Array.isArray(entry) ? (entry as string[]) : entry && typeof entry === 'object' ? Object.keys(entry) : null;
    if (options === null || item.catalog === ('generation' as AvatarCatalogKey) || item.catalog === ('photo' as AvatarCatalogKey)) {
      problems.push(`${where}: avatar kataloğu değil (${String(item.catalog)}).`);
      continue;
    }
    if (!options.includes(item.optionId)) problems.push(`${where}: ${item.catalog} kataloğunda "${item.optionId}" yok.`);
    const ref = optionRef(item.catalog, item.optionId);
    if (refs.has(ref)) problems.push(`${where}: aynı seçeneği ikinci bir ürün açıyor.`);
    refs.add(ref);
  }
  // Her katalogda en az bir ÜCRETSİZ seçenek kalmalı (varsayılan avatar bundan seçer).
  for (const [catalog, entry] of Object.entries(avatar)) {
    if (catalog === 'generation' || catalog === 'photo') continue;
    const options = Array.isArray(entry) ? (entry as string[]) : Object.keys(entry as Record<string, string>);
    if (options.every((option) => refs.has(`${catalog}:${option}`))) {
      problems.push(`${catalog}: bütün seçenekler mağazada — en az bir ücretsiz seçenek kalmalı.`);
    }
  }
  return problems;
}
