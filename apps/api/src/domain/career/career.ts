import type { CareerConfig, CareerTierConfig, HippodromeLevel, HippodromesConfig } from '@at-sevdalisi/game-config';

/**
 * STADYUMDAN STADYUMA KARİYER (16.10.2026, brief §10) — saf, framework'süz.
 *
 * - Puan SAYAÇ DEĞİLDİR: oyuncunun KOŞTURDUĞU (`race_entries.player_id`)
 *   bitmiş yarışlardaki derecelerinden türetilir. Yarış sınıfı (masa,
 *   masasız lobi, turnuva, pratik) ve dereceye göre `racePoints`.
 * - Kademe puan eşiğiyle belirlenir ve BİRİKİMLİ açar: masalar
 *   (`economy.raceTiers`) ve pist seviyeleri (`hippodromes.level`).
 * - Masasız/ücretsiz yarışlar ve Türkiye pistleri ilk kademede açıktır —
 *   tek başına oynayan yeni oyuncu hiçbir zaman kilitli kalmaz.
 */

/** Puan sınıfları: masa kimlikleri + bu üç sabit. */
export const CAREER_FIXED_CLASSES = ['practice', 'open', 'tournament'] as const;

export interface CareerTierState {
  tier: CareerTierConfig;
  index: number;
  next: CareerTierConfig | null;
  /** Bir sonraki kademeye kalan puan (son kademede 0). */
  pointsToNext: number;
}

/** Derecenin puanı: 1–3 kendi değeri, diğer her bitiriş dördüncü değer. */
export function careerPointsForPlace(classKey: string, finishPosition: number, config: CareerConfig): number {
  const table = config.racePoints[classKey];
  if (!table || !Number.isInteger(finishPosition) || finishPosition < 1) return 0;
  return table[Math.min(finishPosition, 4) - 1] ?? 0;
}

export function resolveCareerTier(points: number, config: CareerConfig): CareerTierState {
  let index = 0;
  for (let i = 0; i < config.tiers.length; i += 1) {
    if (points >= config.tiers[i]!.requiredPoints) index = i;
  }
  const next = config.tiers[index + 1] ?? null;
  return {
    tier: config.tiers[index]!,
    index,
    next,
    pointsToNext: next === null ? 0 : Math.max(0, next.requiredPoints - points),
  };
}

/** Bir masayı / pist seviyesini açan kademe (yoksa `null` = hiçbir kademe açmıyor). */
export function tierUnlockingTable(tableId: string, config: CareerConfig): CareerTierConfig | null {
  return config.tiers.find((tier) => tier.unlocksTables.includes(tableId)) ?? null;
}

export function tierUnlockingHippodromeLevel(level: HippodromeLevel, config: CareerConfig): CareerTierConfig | null {
  return config.tiers.find((tier) => tier.unlocksHippodromeLevels.includes(level)) ?? null;
}

/**
 * Yarışa erişim: masa ve pist seviyesi için gereken EN YÜKSEK kademe. Oyuncunun
 * kademesi yetiyorsa `null`; yetmiyorsa gereken kademe. Bilinmeyen masa/seviye
 * KAPALIDIR (son kademe ister) — config hatası oyuncuya açık kapı olmaz.
 */
export function requiredCareerTierFor(
  race: { tableId: string | null; hippodromeLevel: HippodromeLevel | null },
  config: CareerConfig,
): CareerTierConfig {
  const last = config.tiers[config.tiers.length - 1]!;
  const candidates: CareerTierConfig[] = [config.tiers[0]!];
  if (race.tableId !== null) candidates.push(tierUnlockingTable(race.tableId, config) ?? last);
  if (race.hippodromeLevel !== null) candidates.push(tierUnlockingHippodromeLevel(race.hippodromeLevel, config) ?? last);
  return candidates.reduce((best, tier) =>
    config.tiers.indexOf(tier) > config.tiers.indexOf(best) ? tier : best,
  );
}

export function careerAccessProblem(
  race: { tableId: string | null; hippodromeLevel: HippodromeLevel | null },
  points: number,
  config: CareerConfig,
): { required: CareerTierConfig; current: CareerTierState } | null {
  const required = requiredCareerTierFor(race, config);
  const current = resolveCareerTier(points, config);
  return config.tiers.indexOf(required) <= current.index ? null : { required, current };
}

/**
 * Config bütünlüğü (API açılışında): ilk kademe 0 puan, eşikler kesin artan,
 * her masa ve her pist seviyesi TAM BİR kademede açılır, her masanın ve sabit
 * sınıfların puan tablosu var (4 negatif olmayan tam sayı, artmayan).
 */
export function validateCareerConfig(
  config: CareerConfig,
  tableIds: readonly string[],
  hippodromeLevels: readonly HippodromeLevel[],
): string[] {
  const problems: string[] = [];
  if (config.tiers.length === 0) return ['En az bir kariyer kademesi olmalı.'];
  if (config.tiers[0]!.requiredPoints !== 0) problems.push('İlk kademe 0 puanla başlamalı.');
  const keys = new Set<string>();
  config.tiers.forEach((tier, index) => {
    if (keys.has(tier.key)) problems.push(`Kademe anahtarı tekrarlı: ${tier.key}`);
    keys.add(tier.key);
    if (!tier.name.trim()) problems.push(`Kademe adı boş: ${tier.key}`);
    if (index > 0 && !(tier.requiredPoints > config.tiers[index - 1]!.requiredPoints)) {
      problems.push(`Kademe eşikleri kesin artan olmalı: ${tier.key}`);
    }
  });
  for (const tableId of tableIds) {
    const count = config.tiers.filter((tier) => tier.unlocksTables.includes(tableId)).length;
    if (count !== 1) problems.push(`Masa "${tableId}" tam bir kademede açılmalı (şu an ${count}).`);
    if (!config.racePoints[tableId]) problems.push(`Masa "${tableId}" için puan tablosu yok.`);
  }
  for (const tier of config.tiers) {
    for (const tableId of tier.unlocksTables) {
      if (!tableIds.includes(tableId)) problems.push(`Bilinmeyen masa: ${tableId} (${tier.key})`);
    }
  }
  for (const level of hippodromeLevels) {
    const count = config.tiers.filter((tier) => tier.unlocksHippodromeLevels.includes(level)).length;
    if (count !== 1) problems.push(`Pist seviyesi "${level}" tam bir kademede açılmalı (şu an ${count}).`);
  }
  for (const fixed of CAREER_FIXED_CLASSES) {
    if (!config.racePoints[fixed]) problems.push(`"${fixed}" sınıfı için puan tablosu yok.`);
  }
  for (const [classKey, table] of Object.entries(config.racePoints)) {
    if (
      !Array.isArray(table) ||
      table.length !== 4 ||
      table.some((value) => !Number.isInteger(value) || value < 0) ||
      table.some((value, index) => index > 0 && value > table[index - 1]!)
    ) {
      problems.push(`"${classKey}" puan tablosu 4 artmayan, negatif olmayan tam sayı olmalı.`);
    }
  }
  if (!Number.isInteger(config.historyLimit) || config.historyLimit < 1) problems.push('historyLimit pozitif tam sayı olmalı.');
  return problems;
}

/**
 * Yarışın masası + pist anahtarından gereken kademe (yetiyorsa `null`).
 * Lobi listesi, yarış açma ve katılım kapısı AYNI fonksiyonu kullanır.
 */
export function careerRequirementForRace(
  race: { tableId: string | null; hippodromeKey: string | null },
  points: number,
  career: CareerConfig,
  hippodromes: HippodromesConfig,
): { key: string; name: string; pointsToRequired: number } | null {
  const hippodromeLevel =
    race.hippodromeKey === null
      ? null
      : (hippodromes.hippodromes.find((hippodrome) => hippodrome.key === race.hippodromeKey)?.level ?? null);
  const problem = careerAccessProblem({ tableId: race.tableId, hippodromeLevel }, points, career);
  if (problem === null) return null;
  return {
    key: problem.required.key,
    name: problem.required.name,
    pointsToRequired: Math.max(0, problem.required.requiredPoints - points),
  };
}
