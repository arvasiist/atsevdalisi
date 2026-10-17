import type { HippodromeConfig, HippodromeLevel, HippodromesConfig } from '@at-sevdalisi/game-config';

/**
 * HİPODROMLAR (08.10.2026) — saf. Yarış bir hipodroma `races.track_id` ile
 * bağlanır; anahtar ↔ kimlik eşlemesi config'tedir (migration 0072 aynı
 * satırları yazar, `hippodromes.spec.ts` ikisini karşılaştırır). Hipodrom
 * YALNIZCA sahneyi/kimliği belirler — motor pist ölçüsü okumaz, sonuç
 * değişmez.
 */
export function hippodromeKeys(config: HippodromesConfig): string[] {
  return config.hippodromes.map((hippodrome) => hippodrome.key);
}

export function findHippodrome(
  config: HippodromesConfig,
  key: string | null,
): HippodromeConfig | null {
  return config.hippodromes.find((hippodrome) => hippodrome.key === key) ?? null;
}

/** `races.track_id` → hipodrom anahtarı; eşlenmeyen (eski/NULL) kimlik `null`. */
export function hippodromeKeyForTrack(
  config: HippodromesConfig,
  trackId: string | null,
): string | null {
  if (trackId === null) return null;
  return config.hippodromes.find((hippodrome) => hippodrome.trackId === trackId)?.key ?? null;
}

/** `races.track_id` → görünen anahtar; NULL/eşlenmeyen kimlik varsayılan hipodromdur. */
export function resolveHippodromeKey(config: HippodromesConfig, trackId: string | null): string {
  return hippodromeKeyForTrack(config, trackId) ?? config.defaultKey;
}

/** Anahtar → `tracks.id`; bilinmeyen anahtar `null` (çağıran önce doğrular). */
export function trackIdForHippodrome(config: HippodromesConfig, key: string | null): string | null {
  return findHippodrome(config, key)?.trackId ?? null;
}

/**
 * Oyuncunun seçmediği yarışlar (pratik, eşleşme) için hipodrom: yarış
 * kimliğinden DETERMİNİST (FNV-1a) — aynı yarış her zaman aynı hipodromda
 * görünür (koşu sırasında ve tekrarında), yarışlar hipodromlara dağılır.
 */
export function pickHippodromeForRace(config: HippodromesConfig, raceId: string): HippodromeConfig {
  let hash = 0x811c9dc5;
  for (let i = 0; i < raceId.length; i += 1) {
    hash ^= raceId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // 16.10.2026 — havuz sabittir (`practicePool`): yeni pist eklemek eski
  // yarışların tekrarındaki mekânı değiştirmez.
  const pool = config.practicePool.map((key) => findHippodrome(config, key)!);
  return pool[(hash >>> 0) % pool.length]!;
}

/** 16.10.2026 (brief §9) — pist seviyeleri, düşükten yükseğe. */
export const HIPPODROME_LEVELS: readonly HippodromeLevel[] = ['local', 'regional', 'national', 'international'];
const KNOWN_SURFACES = ['grass', 'dirt', 'synthetic'] as const;

/**
 * Yarış pistin kurallarına uyuyor mu: zemin ve mesafe pistin listesinde,
 * masa (varsa) pistin ağırladığı masalardan. Hipodrom seçilmemiş yarış
 * (varsayılan pist) eskisi gibi serbesttir.
 */
export function hippodromeRaceProblems(
  race: { hippodrome: string | null; surface: string; distanceMeters: number; tableId?: string | null },
  config: HippodromesConfig,
): string[] {
  if (race.hippodrome === null) return [];
  const hippodrome = findHippodrome(config, race.hippodrome);
  if (!hippodrome) return [`Bilinmeyen hipodrom: ${race.hippodrome}.`];
  const problems: string[] = [];
  if (!(hippodrome.surfaces as readonly string[]).includes(race.surface)) {
    problems.push(`${hippodrome.shortName} pistinde ${race.surface} zemin yok (zeminler: ${hippodrome.surfaces.join(', ')}).`);
  }
  if (!hippodrome.distancesMeters.includes(race.distanceMeters)) {
    problems.push(
      `${hippodrome.shortName} pistinde ${race.distanceMeters} m koşulmaz (mesafeler: ${hippodrome.distancesMeters.join(', ')}).`,
    );
  }
  if (race.tableId && !hippodrome.tables.includes(race.tableId)) {
    problems.push(`${hippodrome.shortName} "${race.tableId}" masasını ağırlamaz (masalar: ${hippodrome.tables.join(', ')}).`);
  }
  return problems;
}

/** Config tutarlılığı: anahtar/kimlik tekil, varsayılan tanımlı. Sorun listesi döner. */
export function validateHippodromesConfig(config: HippodromesConfig): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  const ids = new Set<string>();
  for (const hippodrome of config.hippodromes) {
    if (keys.has(hippodrome.key)) problems.push(`Hipodrom anahtarı tekrarlı: ${hippodrome.key}`);
    if (ids.has(hippodrome.trackId))
      problems.push(`Hipodrom kimliği tekrarlı: ${hippodrome.trackId}`);
    keys.add(hippodrome.key);
    ids.add(hippodrome.trackId);
    if (!hippodrome.name.trim() || !hippodrome.shortName.trim()) {
      problems.push(`Hipodrom adı/kısa adı boş: ${hippodrome.key}`);
    }
    if (hippodrome.lapLengthMeters <= 0 || hippodrome.turnRadiusMeters <= 0) {
      problems.push(`Hipodrom ölçüsü geçersiz: ${hippodrome.key}`);
    }
    // 16.10.2026 (brief §9) — ülke/seviye/prestij/zemin/mesafe/masa.
    if (!hippodrome.country?.trim() || !/^[A-Z]{2}$/.test(hippodrome.countryCode ?? '') || !hippodrome.city?.trim()) {
      problems.push(`Hipodrom ülke/şehir bilgisi eksik: ${hippodrome.key}`);
    }
    if (!HIPPODROME_LEVELS.includes(hippodrome.level)) problems.push(`Hipodrom seviyesi geçersiz: ${hippodrome.key}`);
    if (!Number.isInteger(hippodrome.prestige) || hippodrome.prestige < 1 || hippodrome.prestige > 5) {
      problems.push(`Hipodrom prestiji 1-5 olmalı: ${hippodrome.key}`);
    }
    if (
      !Array.isArray(hippodrome.surfaces) ||
      hippodrome.surfaces.length === 0 ||
      hippodrome.surfaces.some((surface) => !(KNOWN_SURFACES as readonly string[]).includes(surface))
    ) {
      problems.push(`Hipodrom zeminleri geçersiz: ${hippodrome.key}`);
    }
    if (
      !Array.isArray(hippodrome.distancesMeters) ||
      hippodrome.distancesMeters.length === 0 ||
      hippodrome.distancesMeters.some((distance) => !Number.isInteger(distance) || distance <= 0)
    ) {
      problems.push(`Hipodrom mesafeleri geçersiz: ${hippodrome.key}`);
    }
    if (!Array.isArray(hippodrome.tables) || hippodrome.tables.length === 0) {
      problems.push(`Hipodromun ağırladığı masa yok: ${hippodrome.key}`);
    }
  }
  if (!Array.isArray(config.practicePool) || config.practicePool.length === 0) {
    problems.push('Pratik yarış hipodrom havuzu boş.');
  } else {
    for (const key of config.practicePool) {
      if (!keys.has(key)) problems.push(`Pratik havuzundaki hipodrom tanımlı değil: ${key}`);
    }
  }
  if (config.hippodromes.length === 0) problems.push('En az bir hipodrom tanımlı olmalı.');
  if (!keys.has(config.defaultKey))
    problems.push(`Varsayılan hipodrom tanımlı değil: ${config.defaultKey}`);
  return problems;
}
