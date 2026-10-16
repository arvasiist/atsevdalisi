import type { AvatarAppearance, AvatarField, CosmeticItemView } from '@at-sevdalisi/shared-types';

/**
 * Kozmetik kilit yardımcıları (09.10.2026). Saf. Kural SUNUCUDADIR
 * (`PUT /avatar` sahip olunmayan kilitli seçeneği 409 ile reddeder); bunlar
 * yalnızca düzenleyicinin neyi kilitli göstereceğini ve kaydetmeden önce
 * neyin satın alınması gerektiğini söyler.
 */

/** Seçeneği açan ürün; seçenek ücretsizse `null`. */
export function cosmeticForOption(
  items: readonly CosmeticItemView[],
  catalog: string,
  optionId: string,
): CosmeticItemView | null {
  return items.find((item) => item.catalog === catalog && item.optionId === optionId) ?? null;
}

/** Taslakta seçili ama SAHİP OLUNMAYAN ürünler (tekrarsız, katalog sırasıyla). */
export function lockedSelections(
  appearance: AvatarAppearance,
  items: readonly CosmeticItemView[],
  catalogOf: (field: AvatarField) => string,
): CosmeticItemView[] {
  const locked = new Map<string, CosmeticItemView>();
  for (const [field, option] of Object.entries(appearance) as Array<[AvatarField, string]>) {
    const item = cosmeticForOption(items, catalogOf(field), option);
    if (item !== null && !item.owned) locked.set(item.key, item);
  }
  return [...locked.values()];
}

/** Mağaza bölümleri: ürünler kataloğa göre, config sırası korunarak gruplanır. */
export function groupCosmeticsByCatalog(
  items: readonly CosmeticItemView[],
): Array<[string, CosmeticItemView[]]> {
  const groups = new Map<string, CosmeticItemView[]>();
  for (const item of items) {
    const group = groups.get(item.catalog) ?? [];
    group.push(item);
    groups.set(item.catalog, group);
  }
  return [...groups.entries()];
}
