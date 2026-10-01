/**
 * Atın GÖRÜNÜŞÜ (01.10.2026) — don rengi + yüz/bacak işaretleri. 3D sahne
 * "oyuncunun atını" göstermek için bu alanları okur; bunlar sonradan
 * DEĞİŞMEZ (at yaşadıkça don rengi değişmez — kasten basit tutuldu).
 *
 * Determinizm: seçim `createSeededRandom(seed)` ile yapılır, seed atın
 * kimliğidir (`${horseId}:appearance:...`). Aynı kimlik = aynı görünüş;
 * `Math.random()` YOK (CLAUDE.md kural 3). Ağırlıklar config'tedir.
 */

import type { HorseAppearanceConfig } from '@at-sevdalisi/game-config';
import {
  HORSE_COAT_COLORS,
  HORSE_FACE_MARKINGS,
  HORSE_LEG_MARKINGS,
  createSeededRandom,
  type HorseAppearance,
  type HorseCoatColor,
} from '@at-sevdalisi/shared-types';

/** Ağırlıklı seçim. Yalnızca `allowed` kümesindeki anahtarlar ve pozitif ağırlıklar sayılır. */
export function pickWeighted<T extends string>(
  weights: Record<string, number>,
  allowed: readonly T[],
  roll: number,
): T {
  const entries = allowed
    .map((key) => [key, weights[key] ?? 0] as const)
    .filter(([, weight]) => weight > 0);
  if (entries.length === 0) {
    throw new Error(
      'Görünüş ağırlıkları boş — config/horse-appearance.config.json en az bir pozitif ağırlık içermeli.',
    );
  }
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = roll * total;
  for (const [key, weight] of entries) {
    cursor -= weight;
    if (cursor < 0) {
      return key;
    }
  }
  return entries[entries.length - 1]![0];
}

/** Ebeveynsiz bir atın (başlangıç atı vb.) görünüşü — config ağırlıklarıyla. */
export function deriveAppearance(horseId: string, config: HorseAppearanceConfig): HorseAppearance {
  return {
    coatColor: pickWeighted(
      config.coatWeights,
      HORSE_COAT_COLORS,
      createSeededRandom(`${horseId}:appearance:coat`)(),
    ),
    faceMarking: pickWeighted(
      config.faceMarkingWeights,
      HORSE_FACE_MARKINGS,
      createSeededRandom(`${horseId}:appearance:face`)(),
    ),
    legMarking: pickWeighted(
      config.legMarkingWeights,
      HORSE_LEG_MARKINGS,
      createSeededRandom(`${horseId}:appearance:leg`)(),
    ),
  };
}

/**
 * Tayın görünüşü: `parentCoatChance` olasılıkla bir ebeveynin donu
 * (`sireCoatShare` babadan alma payı), aksi hâlde ağırlıklı rastgele don.
 * İşaretler ebeveynden geçmez (gerçekte de kalıtımı zayıftır) — ağırlıklı seçilir.
 */
export function inheritAppearance(
  foalId: string,
  sireCoat: HorseCoatColor,
  damCoat: HorseCoatColor,
  config: HorseAppearanceConfig,
): HorseAppearance {
  const base = deriveAppearance(foalId, config);
  const rng = createSeededRandom(`${foalId}:appearance:inherit`);
  if (rng() >= config.inheritance.parentCoatChance) {
    return base;
  }
  return { ...base, coatColor: rng() < config.inheritance.sireCoatShare ? sireCoat : damCoat };
}
